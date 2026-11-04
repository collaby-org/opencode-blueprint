import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test, { after } from "node:test"
import type { PluginConfig } from "../lib/config"
import type { WithParts } from "../lib/state"

// Storage location is resolved from XDG_DATA_HOME at module load, so it has to
// point at a temp dir before the plugin modules are imported.
const root = mkdtempSync(join(tmpdir(), "dcp-manual-mode-"))
const previousDataHome = process.env.XDG_DATA_HOME
process.env.XDG_DATA_HOME = root

const { createSessionState, ensureSessionInitialized, refreshManualMode, saveSessionState } =
    await import("../lib/state")
const { loadManualModeSetting, loadSessionState, saveManualModeSetting } = await import(
    "../lib/state/persistence"
)
const { isContextOverLimits } = await import("../lib/messages/inject/utils")
const { injectCompressNudges } = await import("../lib/messages/inject/inject")

after(() => {
    if (previousDataHome === undefined) delete process.env.XDG_DATA_HOME
    else process.env.XDG_DATA_HOME = previousDataHome
    rmSync(root, { recursive: true, force: true })
})

const logger = { info() {}, warn() {}, error() {}, debug() {} } as any
const prompts = {
    contextLimitNudge: "CONTEXT LIMIT NUDGE",
    turnNudge: "TURN NUDGE",
    iterationNudge: "ITERATION NUDGE",
} as any
const client = { session: { get: async () => ({ data: {} }) } } as any

function configWith(maxContextLimit: number): PluginConfig {
    return {
        compress: {
            mode: "range",
            permission: "allow",
            showCompression: false,
            summaryBuffer: false,
            maxContextLimit,
            minContextLimit: 1000,
            nudgeFrequency: 1,
            iterationNudgeThreshold: 1,
            nudgeForce: "soft",
            protectedTools: [],
            protectTags: false,
            protectUserMessages: false,
        },
    } as unknown as PluginConfig
}

/** Builds a conversation whose reported token usage is exactly `total`. */
function conversation(total: number): WithParts[] {
    // Ends on a user turn so the soft turn-nudge branch is reachable.
    return [
        {
            info: {
                id: "msg_user",
                sessionID: "ses_manual",
                role: "user",
                time: { created: 1 },
                agent: "build",
                model: { providerID: "nvidia", modelID: "kimi-k2" },
            },
            parts: [{ type: "text", id: "prt_user", messageID: "msg_user", text: "hello" }],
        },
        {
            info: {
                id: "msg_asst",
                sessionID: "ses_manual",
                role: "assistant",
                time: { created: 2 },
                tokens: { input: Math.max(0, total - 1), output: 1 },
            },
            parts: [{ type: "text", id: "prt_asst", messageID: "msg_asst", text: "ok" }],
        },
        {
            info: {
                id: "msg_user2",
                sessionID: "ses_manual",
                role: "user",
                time: { created: 3 },
                agent: "build",
                model: { providerID: "nvidia", modelID: "kimi-k2" },
            },
            parts: [{ type: "text", id: "prt_user2", messageID: "msg_user2", text: "next" }],
        },
    ] as unknown as WithParts[]
}

// ---------------------------------------------------------------------------
// 1. loadManualModeSetting mapping
// ---------------------------------------------------------------------------

test("loadManualModeSetting maps persisted manual-mode values", async () => {
    await saveManualModeSetting("ses_true", true, logger)
    assert.equal(await loadManualModeSetting("ses_true", logger), true)

    await saveManualModeSetting("ses_active", "active", logger)
    assert.equal(await loadManualModeSetting("ses_active", logger), true)

    await saveManualModeSetting("ses_false", false, logger)
    assert.equal(await loadManualModeSetting("ses_false", logger), false)

    // Transient: must fall back to the configured default, never re-arm.
    await saveManualModeSetting("ses_pending", "compress-pending", logger)
    assert.equal(await loadManualModeSetting("ses_pending", logger), undefined)

    // No state file at all.
    assert.equal(await loadManualModeSetting("ses_absent", logger), false)
})

// ---------------------------------------------------------------------------
// 2. The leak: a concurrent save while /dcp-compress is in flight
// ---------------------------------------------------------------------------

test("a concurrent save during /dcp-compress persists the pending value, not a boolean", async () => {
    const state = createSessionState()
    state.sessionId = "ses_leak"
    state.manualMode = "compress-pending"

    await saveSessionState(state, logger)

    const persisted = await loadSessionState("ses_leak", logger)
    assert.equal(persisted?.manualMode, "compress-pending")
    assert.equal(await loadManualModeSetting("ses_leak", logger), undefined)
})

test("a persisted pending trigger never re-arms manual mode on the next turn", async () => {
    const state = createSessionState()
    state.sessionId = "ses_rearm"
    state.manualMode = "compress-pending"
    await saveSessionState(state, logger)

    // Fresh in-memory state (the release already ran, or the process restarted).
    const fresh = createSessionState()

    await refreshManualMode(fresh, "ses_rearm", logger, false)
    assert.equal(fresh.manualMode, false, "must not leak manual mode ON")

    await refreshManualMode(fresh, "ses_rearm", logger, true)
    assert.equal(fresh.manualMode, "active", "configured default still wins")

    // An explicit user toggle keeps working.
    await saveManualModeSetting("ses_rearm", "active", logger)
    await refreshManualMode(fresh, "ses_rearm", logger, false)
    assert.equal(fresh.manualMode, "active")
})

// ---------------------------------------------------------------------------
// 3. Hydration never restores an in-flight trigger
// ---------------------------------------------------------------------------

test("hydration keeps legacy booleans and drops a pending trigger", async () => {
    await saveManualModeSetting("ses_hydrate_on", "active", logger)
    await saveManualModeSetting("ses_hydrate_legacy", true, logger)
    await saveManualModeSetting("ses_hydrate_off", false, logger)
    await saveManualModeSetting("ses_hydrate_pending", "compress-pending", logger)

    for (const [sessionId, expected] of [
        ["ses_hydrate_on", "active"],
        ["ses_hydrate_legacy", "active"],
        ["ses_hydrate_off", false],
        ["ses_hydrate_pending", false],
    ] as const) {
        const state = createSessionState()
        await ensureSessionInitialized(
            client,
            state,
            sessionId,
            logger,
            conversation(10),
            expected === "active",
        )
        assert.equal(state.manualMode, expected, `hydration of ${sessionId}`)
    }
})

// ---------------------------------------------------------------------------
// 4. effectiveMax clamp against the provider window
// ---------------------------------------------------------------------------

test("the max threshold is clamped to provider window minus headroom", () => {
    const state = createSessionState()
    state.modelContextLimit = 262144

    // 300000 configured, 262144 window -> effective 242144.
    const wide = configWith(300000)
    assert.equal(isContextOverLimits(wide, state, "nvidia", "kimi-k2", conversation(242145)).overMaxLimit, true)
    assert.equal(
        isContextOverLimits(wide, state, "nvidia", "kimi-k2", conversation(242144)).overMaxLimit,
        false,
        "242144 must still fit inside the window",
    )

    // 100000 configured, 262144 window -> stays 100000, no clamp applied.
    const narrow = configWith(100000)
    assert.equal(
        isContextOverLimits(narrow, state, "nvidia", "kimi-k2", conversation(100001)).overMaxLimit,
        true,
    )
    assert.equal(
        isContextOverLimits(narrow, state, "nvidia", "kimi-k2", conversation(100000)).overMaxLimit,
        false,
    )
})

test("an unknown provider window leaves the configured limit untouched", () => {
    const state = createSessionState()
    state.modelContextLimit = undefined

    const config = configWith(300000)
    assert.equal(
        isContextOverLimits(config, state, "nvidia", "kimi-k2", conversation(300001)).overMaxLimit,
        true,
    )
    assert.equal(
        isContextOverLimits(config, state, "nvidia", "kimi-k2", conversation(300000)).overMaxLimit,
        false,
    )
})

// ---------------------------------------------------------------------------
// 5. Hard wall: manual mode suppresses soft nudges, never the window nudge
// ---------------------------------------------------------------------------

test("manual mode still arms the context-limit nudge at the provider wall", () => {
    const state = createSessionState()
    state.modelContextLimit = 262144
    state.manualMode = "compress-pending"

    injectCompressNudges(state, configWith(300000), logger, conversation(250000), prompts)

    assert.ok(
        state.nudges.contextLimitAnchors.size > 0,
        "the provider-window anchor must survive manual mode",
    )
    assert.equal(state.nudges.turnNudgeAnchors.size, 0)
    assert.equal(state.nudges.iterationNudgeAnchors.size, 0)
})

test("manual mode below the wall adds no anchor at all", () => {
    const state = createSessionState()
    state.modelContextLimit = 262144
    state.manualMode = "compress-pending"

    injectCompressNudges(state, configWith(300000), logger, conversation(1000), prompts)

    assert.equal(state.nudges.contextLimitAnchors.size, 0)
    assert.equal(state.nudges.turnNudgeAnchors.size, 0)
    assert.equal(state.nudges.iterationNudgeAnchors.size, 0)
})

test("automatic mode keeps arming the soft turn nudge below the wall", () => {
    const state = createSessionState()
    state.modelContextLimit = 262144

    injectCompressNudges(state, configWith(300000), logger, conversation(1000), prompts)

    assert.ok(state.nudges.turnNudgeAnchors.size > 0)
    assert.equal(state.nudges.contextLimitAnchors.size, 0)
})
