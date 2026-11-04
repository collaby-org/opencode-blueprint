import assert from "node:assert/strict"
import test from "node:test"
import type { PluginConfig } from "../lib/config"
import type { WithParts } from "../lib/state"

const { createSessionState } = await import("../lib/state")
const { getCurrentTokenUsage } = await import("../lib/token-utils")
const { isContextOverLimits } = await import("../lib/messages/inject/utils")

function textPart(messageID: string, sessionID: string, id: string, text: string) {
    return {
        id,
        messageID,
        sessionID,
        type: "text",
        text,
    }
}

function repeatedWord(word: string, count: number): string {
    return Array.from({ length: count }, () => word).join(" ")
}

function buildConfig(maxContextLimit: number, minContextLimit: number): PluginConfig {
    return {
        compress: {
            mode: "range",
            maxContextLimit,
            minContextLimit,
            summaryBuffer: false,
        },
    } as PluginConfig
}

// #582: the last assistant report is a snapshot, not the live context size. A
// large follow-up message grows the context past the reported total, and the
// limits must fire on that growth instead of waiting for the next report.
test("isContextOverLimits accounts for context growth after latest assistant report", () => {
    const sessionID = "ses_context_growth_after_report"
    const reportedTotal = 1000 + 100 + 50 + 25
    const messages: WithParts[] = [
        {
            info: {
                id: "msg-assistant-reported",
                role: "assistant",
                sessionID,
                agent: "assistant",
                time: { created: 1 },
                tokens: {
                    input: 1000,
                    output: 100,
                    reasoning: 50,
                    cache: {
                        read: 25,
                        write: 0,
                    },
                },
            } as WithParts["info"],
            parts: [textPart("msg-assistant-reported", sessionID, "assistant-part", "Done.")],
        },
        {
            info: {
                id: "msg-user-large-followup",
                role: "user",
                sessionID,
                agent: "assistant",
                time: { created: 2 },
            } as WithParts["info"],
            parts: [
                textPart(
                    "msg-user-large-followup",
                    sessionID,
                    "user-large-part",
                    repeatedWord("payload", 5000),
                ),
            ],
        },
    ]
    const state = createSessionState()

    assert.ok(getCurrentTokenUsage(state, messages) > reportedTotal)

    const overLimit = isContextOverLimits(
        buildConfig(reportedTotal + 1, 1),
        state,
        undefined,
        undefined,
        messages,
    )

    assert.equal(overLimit.overMaxLimit, true)
})
