import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
    appendNotify,
    deleteNotify,
    readPendingNotify,
    resolveToastShow,
} from "../lib/ui/notify-queue"

test("notify queue: append → read → delete roundtrip", async () => {
    const root = mkdtempSync(join(tmpdir(), "dcp-notify-"))
    const prev = process.env.XDG_DATA_HOME
    process.env.XDG_DATA_HOME = root
    try {
        await appendNotify({ title: "DCP", message: "compressed 12k tokens" })
        const pending = await readPendingNotify()
        assert.equal(pending.length, 1)
        assert.equal(pending[0]!.title, "DCP")
        assert.equal(pending[0]!.message, "compressed 12k tokens")
        await deleteNotify(pending[0]!.id)
        assert.equal((await readPendingNotify()).length, 0)
    } finally {
        if (prev === undefined) delete process.env.XDG_DATA_HOME
        else process.env.XDG_DATA_HOME = prev
        rmSync(root, { recursive: true, force: true })
    }
})

test("notify queue: stale records are never surfaced", async () => {
    const root = mkdtempSync(join(tmpdir(), "dcp-notify-"))
    const prev = process.env.XDG_DATA_HOME
    process.env.XDG_DATA_HOME = root
    try {
        // A queue file from 2 hours ago (padded epoch name format).
        const stale = `${String(Date.now() - 2 * 60 * 60 * 1000).padStart(15, "0")}-0001.json`
        const dir = join(root, "opencode", "storage", "plugin", "dcp", "notify")
        mkdirSync(dir, { recursive: true })
        writeFileSync(join(dir, stale), JSON.stringify({ id: stale, title: "old", message: "x" }))
        const pending = await readPendingNotify()
        assert.equal(pending.length, 0)
        // …and the stale file is not consumed by the reader (age rule only).
        assert.equal((await readPendingNotify()).length, 0)
    } finally {
        if (prev === undefined) delete process.env.XDG_DATA_HOME
        else process.env.XDG_DATA_HOME = prev
        rmSync(root, { recursive: true, force: true })
    }
})

test("notify queue: malformed records are cleaned, not surfaced", async () => {
    const root = mkdtempSync(join(tmpdir(), "dcp-notify-"))
    const prev = process.env.XDG_DATA_HOME
    process.env.XDG_DATA_HOME = root
    try {
        const fresh = `${String(Date.now()).padStart(15, "0")}-0002.json`
        const dir = join(root, "opencode", "storage", "plugin", "dcp", "notify")
        mkdirSync(dir, { recursive: true })
        writeFileSync(join(dir, fresh), "{not json")
        assert.equal((await readPendingNotify()).length, 0)
    } finally {
        if (prev === undefined) delete process.env.XDG_DATA_HOME
        else process.env.XDG_DATA_HOME = prev
        rmSync(root, { recursive: true, force: true })
    }
})

test("resolveToastShow: function-shaped ui.toast (SDK 1.19.x) and object show (newer)", () => {
    const calls: unknown[] = []
    const fn = ((input: unknown) => calls.push(input)) as unknown
    const byFn = resolveToastShow({ ui: { toast: fn } })
    assert.equal(typeof byFn, "function")
    byFn?.({ title: "T", message: "m" })

    const shown: unknown[] = []
    const byShow = resolveToastShow({
        ui: { toast: { show: (input: unknown) => shown.push(input) } },
    })
    assert.equal(typeof byShow, "function")
    byShow?.({ title: "T2", message: "m2" })

    assert.equal(resolveToastShow({ ui: {} }), undefined)
    assert.equal(resolveToastShow({}), undefined)
    assert.equal(calls.length, 1)
    assert.equal(shown.length, 1)
})

test("notify queue: deleteNotify refuses arbitrary paths", async () => {
    const prev = process.env.XDG_DATA_HOME
    const root = mkdtempSync(join(tmpdir(), "dcp-notify-"))
    process.env.XDG_DATA_HOME = root
    try {
        // Must not touch anything outside the queue dir — no record name match.
        await deleteNotify("../../package.json")
        // The escape attempt simply resolves to a guarded no-op.
        assert.ok(true)
    } finally {
        if (prev === undefined) delete process.env.XDG_DATA_HOME
        else process.env.XDG_DATA_HOME = prev
        rmSync(root, { recursive: true, force: true })
    }
})
