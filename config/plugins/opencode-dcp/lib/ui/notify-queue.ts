/**
 * File-queue transport for server → TUI notifications.
 *
 * The upstream #627 toast pair rides `registration.events` (server) +
 * `ctx.data.on("rpc.dcp.notify")` (TUI), both of which only exist in plugin
 * SDKs newer than the one opencode 2.2.5 embeds (1.19.5: no event bus on the
 * plugin registration, no `client.rpc`, no `ctx.data`, no `ctx.ui.toast.show`).
 *
 * This queue needs none of those: the server appends JSON records under the
 * DCP storage dir (same dir session state already lives in), and the TUI
 * plugin polls it and renders each record through the one API 1.19.5 does
 * expose: `api.ui.toast()`. Records are deleted after rendering and stale
 * ones are dropped, so a TUI restart never replays old toasts.
 *
 * Ephemeral by design: nothing here enters model context.
 */

import * as fs from "fs/promises"
import { existsSync } from "fs"
import { homedir } from "os"
import { join } from "path"

export interface NotifyRecord {
    id: string
    title: string
    message: string
    variant?: "info" | "success" | "warning" | "error"
    duration?: number
}

function dataRoot(): string {
    return process.env.XDG_DATA_HOME || join(homedir(), ".local", "share")
}

function notifyDirPath(): string {
    return join(dataRoot(), "opencode", "storage", "plugin", "dcp", "notify")
}

// Ordered, lexicographically sortable queue-file name. The counter keeps
// same-millisecond appends ordered and unique.
let appendCounter = 0

function notifyFileName(ms: number): string {
    appendCounter = (appendCounter + 1) % 10000
    return `${String(ms).padStart(15, "0")}-${String(appendCounter).padStart(4, "0")}.json`
}

/** Append a notify record. Resolves with the record id (the file name). */
export async function appendNotify(
    event: Omit<NotifyRecord, "id">,
): Promise<string> {
    const dir = notifyDirPath()
    if (!existsSync(dir)) await fs.mkdir(dir, { recursive: true })
    const id = notifyFileName(Date.now())
    const record: NotifyRecord = { ...event, id }
    await fs.writeFile(join(dir, id), JSON.stringify(record), "utf8")
    await pruneOld(dir)
    return id
}

function parseId(name: string): number {
    const n = Number.parseInt(name.split("-")[0] || "", 10)
    return Number.isFinite(n) ? n : 0
}

async function pruneOld(dir: string, maxAgeMs = 6 * 60 * 60 * 1000): Promise<void> {
    try {
        const cutoff = Date.now() - maxAgeMs
        for (const name of await fs.readdir(dir)) {
            if (!name.endsWith(".json")) continue
            if (parseId(name) < cutoff) {
                await fs.rm(join(dir, name), { force: true })
            }
        }
    } catch {
        // pruning is best-effort; unreadable dirs are not a notify failure
    }
}

/** Records whose timestamp is too old to be worth a toast are skipped. */
const STALE_MS = 60_000

/**
 * Read pending records. A non-flagged `cancelId` (a record id the caller has
 * decided to skip) is still returned in the list so the caller can clean it
 * up with `deleteNotify`.
 */
export async function readPendingNotify(): Promise<NotifyRecord[]> {
    const dir = notifyDirPath()
    if (!existsSync(dir)) return []
    const names = (await fs.readdir(dir)).filter((n) => n.endsWith(".json")).sort()
    const now = Date.now()
    const out: NotifyRecord[] = []
    for (const name of names) {
        try {
            const raw = await fs.readFile(join(dir, name), "utf8")
            const record = JSON.parse(raw) as NotifyRecord
            if (!record?.message || !/^[0-9]+-[0-9]+\.json$/.test(name)) continue
            if (parseId(name) < now - STALE_MS) continue // stale: drop silently
            out.push(record)
        } catch {
            await fs.rm(join(dir, name), { force: true })
        }
    }
    return out
}

export async function deleteNotify(id: string): Promise<void> {
    if (!/^[0-9]+-[0-9]+\.json$/.test(id)) return // never delete arbitrary paths
    await fs.rm(join(notifyDirPath(), id), { force: true })
}

export type ToastShow = (input: {
    title?: string
    message: string
    variant?: NotifyRecord["variant"]
    duration?: number
}) => void

/**
 * Resolve the host's toast surface across SDK shapes: 1.19.5 exposes
 * `ui.toast(input)` as a function; newer SDKs expose `ui.toast.show(input)`.
 */
export function resolveToastShow(apiLike: {
    ui?: unknown
}): ToastShow | undefined {
    const ui = apiLike?.ui as
        | { toast?: unknown; dialog?: unknown }
        | undefined
    if (typeof ui?.toast === "function") return ui.toast as ToastShow
    const show = (ui?.toast as { show?: unknown } | undefined)?.show
    if (typeof show === "function") return show as ToastShow
    return undefined
}

/**
 * Poll the notify queue and render records as toasts. Returns a stop
 * function; with a lifecycle signal, stopping happens automatically.
 */
export function startNotifyToasts(
    api: {
        ui?: unknown
        lifecycle?: { signal?: AbortSignal; onDispose?: (fn: () => void) => () => void }
    },
    intervalMs = 1500,
): (() => void) | undefined {
    const show = resolveToastShow(api)
    if (!show) return undefined

    let stopped = false
    let busy = false
    const tick = async () => {
        if (busy) return
        busy = true
        try {
            const records = await readPendingNotify()
            for (const record of records) {
                if (stopped) break
                show({
                    title: record.title,
                    message: record.message,
                    variant: record.variant,
                    duration: record.duration,
                })
                await deleteNotify(record.id)
            }
        } catch {
            // queue failures must never surface in the TUI
        } finally {
            busy = false
        }
    }
    const timer = setInterval(() => void tick(), intervalMs)
    const stop = () => {
        if (stopped) return
        stopped = true
        clearInterval(timer)
    }
    if (typeof api?.lifecycle?.onDispose === "function") {
        api.lifecycle.onDispose(stop)
    } else if (api?.lifecycle?.signal) {
        api.lifecycle.signal.addEventListener("abort", stop, { once: true })
    }
    void tick()
    return stop
}
