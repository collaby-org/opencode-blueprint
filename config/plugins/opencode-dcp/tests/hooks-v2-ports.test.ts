import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test, { after } from "node:test"
import type { PluginConfig } from "../lib/config"
import type { WithParts } from "../lib/state"

const dataHome = mkdtempSync(join(tmpdir(), "dcp-hooks-v2-ports-"))
const previousDataHome = process.env.XDG_DATA_HOME
process.env.XDG_DATA_HOME = dataHome
const { createSessionState } = await import("../lib/state")
const { Logger } = await import("../lib/logger")
const { createChatMessageTransformHandler } = await import("../lib/hooks")

after(() => {
    if (previousDataHome === undefined) delete process.env.XDG_DATA_HOME
    else process.env.XDG_DATA_HOME = previousDataHome
    rmSync(dataHome, { recursive: true, force: true })
})

function buildConfig(permission: "allow" | "ask" | "deny" = "allow"): PluginConfig {
    return {
        enabled: true,
        debug: false,
        pruneNotification: "off",
        pruneNotificationType: "chat",
        commands: { enabled: true, protectedTools: [] },
        manualMode: { enabled: false, automaticStrategies: true },
        turnProtection: { enabled: false, turns: 4 },
        experimental: { allowSubAgents: false, customPrompts: false },
        protectedFilePatterns: [],
        compress: {
            mode: "message",
            permission,
            showCompression: false,
            maxContextLimit: 150000,
            minContextLimit: 50000,
            nudgeFrequency: 5,
            iterationNudgeThreshold: 15,
            nudgeForce: "soft",
            protectedTools: ["task"],
            protectTags: false,
            protectUserMessages: false,
        },
        strategies: {
            deduplication: { enabled: true, protectedTools: [] },
            purgeErrors: { enabled: true, turns: 4, protectedTools: [] },
        },
    }
}

function buildMessage(id: string, role: string, text: string, sessionID: string): WithParts {
    return {
        info: { id, sessionID, role, agent: "assistant", time: { created: 1 } },
        parts: [{ id: `${id}-part`, messageID: id, sessionID, type: "text", text }],
    } as WithParts
}

function buildPromptStore() {
    return {
        reload() {},
        getRuntimePrompts() {
            return {
                contextLimitNudge: "",
                turnNudge: "",
                iterationNudge: "",
            }
        },
    }
}

// #670: the system prompt hook reports the model limit only after the message
// transform ran on the first request of a fresh process, so a percentage-based
// threshold had to wait a full turn before the nudge lane could resolve it.
test("chat message transform resolves a percentage threshold before the system prompt hook runs", async () => {
    const state = createSessionState()
    const config = buildConfig("allow")
    config.compress.minContextLimit = "55%"
    config.compress.maxContextLimit = "80%"
    const handler = createChatMessageTransformHandler(
        {
            session: { get: async () => ({}) },
            config: {
                providers: async () => ({
                    data: {
                        providers: [
                            {
                                id: "anthropic",
                                models: { "claude-x": { limit: { context: 200000 } } },
                            },
                        ],
                    },
                }),
            },
        } as any,
        state,
        new Logger(false),
        config,
        buildPromptStore() as any,
        { global: undefined, agents: {} },
    )
    const user = (id: string) => {
        const message = buildMessage(id, "user", "short question", "ses_hooks_ports")
        ;(message.info as any).model = { providerID: "anthropic", modelID: "claude-x" }
        return message
    }

    await handler(
        {},
        {
            messages: [
                user("user-1"),
                buildMessage("assistant-1", "assistant", "short answer", "ses_hooks_ports"),
                user("user-2"),
            ],
        },
    )

    assert.equal(state.modelContextLimit, 200000)
    assert.equal(state.nudges.turnNudgeAnchors.size, 0)
})

// #569 (upstream issue #549 "Message ID alias capacity exceeded"): refs are
// assigned after prune, so a message prune removes never leaks an alias.
test("assignMessageRefs after prune prevents orphan aliases", async () => {
    const sessionID = "ses_alias_leak_test"
    const state = createSessionState()
    const logger = new Logger(false)

    // Prevent checkSession from resetting state via ensureSessionInitialized
    state.sessionId = sessionID

    // Simulate a completed compress — this message should be removed by prune
    state.prune.messages.byMessageId.set("msg-pruned", {
        tokenCount: 100,
        allBlockIds: [1],
        activeBlockIds: [1],
    })

    const messages: WithParts[] = [
        buildMessage("msg-user", "user", "Test message", sessionID),
        buildMessage("msg-assistant-survivor", "assistant", "Survivor response", sessionID),
        buildMessage("msg-pruned", "assistant", "Will be removed", sessionID),
    ]
    ;(messages[0].info as any).model = { providerID: "anthropic", modelID: "claude-test" }

    const handler = createChatMessageTransformHandler(
        {} as any,
        state,
        logger,
        buildConfig("allow"),
        buildPromptStore() as any,
        { global: undefined, agents: {} },
    )

    await handler({}, { messages })

    // Survivors get aliases.
    assert.ok(state.messageIds.byRawId.has("msg-user"), "user message should have alias")
    assert.ok(
        state.messageIds.byRawId.has("msg-assistant-survivor"),
        "survivor should have alias",
    )

    // RED on the old pipeline order (assignMessageRefs before prune): msg-pruned
    //   got an alias before being removed and no cleanup followed.
    // GREEN on the new order: prune removes msg-pruned first, so
    //   assignMessageRefs never sees it.
    assert.ok(
        !state.messageIds.byRawId.has("msg-pruned"),
        "pruned message should NOT have an alias — leak if it does",
    )
})
