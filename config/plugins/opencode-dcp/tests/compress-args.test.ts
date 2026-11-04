import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test, { after } from "node:test"
import type { PluginConfig } from "../lib/config"
import { normalizeMessageArgs, validateArgs as validateMessageArgs } from "../lib/compress/message-utils"
import { normalizeRangeArgs, validateArgs as validateRangeArgs } from "../lib/compress/range-utils"

const dataHome = mkdtempSync(join(tmpdir(), "dcp-compress-args-"))
const previousDataHome = process.env.XDG_DATA_HOME
process.env.XDG_DATA_HOME = dataHome
const { createSessionState } = await import("../lib/state")
const { Logger } = await import("../lib/logger")
const { createCompressRangeTool } = await import("../lib/compress/range")

after(() => {
    if (previousDataHome === undefined) delete process.env.XDG_DATA_HOME
    else process.env.XDG_DATA_HOME = previousDataHome
    rmSync(dataHome, { recursive: true, force: true })
})

// #616: models mis-wrap the `content` argument. The tool coerces what it can
// and teaches the exact shape when it cannot.
test("compress message normalizes single-object content into an array", () => {
    const input = normalizeMessageArgs({
        topic: "Message fix",
        content: { messageId: "m0001", topic: "Label", summary: "Summary text." },
    })
    assert.deepEqual(input.content, [{ messageId: "m0001", topic: "Label", summary: "Summary text." }])
    assert.doesNotThrow(() => validateMessageArgs(input))
})

test("compress message rejects plain-string content with re-send guidance", () => {
    assert.throws(
        () =>
            normalizeMessageArgs({
                topic: "Message fix",
                content: "A plain summary without a message id.",
            }),
        (err: Error) => err.message.includes("JSON array") && err.message.includes("messageId"),
    )
})

test("compress message still rejects empty content arrays", () => {
    const input = normalizeMessageArgs({ topic: "Message fix", content: [] })
    assert.throws(() => validateMessageArgs(input), /content is required and must be a non-empty array/)
})

test("compress message rejects a JSON-encoded empty content array with the non-empty error", () => {
    assert.throws(
        () => normalizeMessageArgs({ topic: "Message fix", content: "[]" }),
        /content is required and must be a non-empty array/,
    )
})

test("compress range normalizes single-object content into an array", () => {
    const input = normalizeRangeArgs({
        topic: "Range fix",
        content: { startId: "m0001", endId: "m0002", summary: "Summary text." },
    })
    assert.deepEqual(input.content, [{ startId: "m0001", endId: "m0002", summary: "Summary text." }])
    assert.doesNotThrow(() => validateRangeArgs(input))
})

test("compress range normalizes JSON-string content into an array", () => {
    const arrayInput = normalizeRangeArgs({
        topic: "Range fix",
        content: JSON.stringify([{ startId: "m0001", endId: "m0002", summary: "Summary text." }]),
    })
    assert.equal(arrayInput.content.length, 1)
    assert.equal(arrayInput.content[0].startId, "m0001")
    assert.doesNotThrow(() => validateRangeArgs(arrayInput))

    const objectInput = normalizeRangeArgs({
        topic: "Range fix",
        content: JSON.stringify({ startId: "m0003", endId: "m0004", summary: "Another." }),
    })
    assert.equal(objectInput.content.length, 1)
    assert.equal(objectInput.content[0].endId, "m0004")
    assert.doesNotThrow(() => validateRangeArgs(objectInput))
})

test("compress range rejects plain-string content with re-send guidance", () => {
    assert.throws(
        () =>
            normalizeRangeArgs({
                topic: "Range fix",
                content: "A plain summary without range boundaries.",
            }),
        (err: Error) =>
            err.message.includes("JSON array") &&
            err.message.includes("startId") &&
            err.message.includes("endId"),
    )
})

test("compress range still rejects empty content arrays", () => {
    const input = normalizeRangeArgs({ topic: "Range fix", content: [] })
    assert.throws(() => validateRangeArgs(input), /content is required and must be a non-empty array/)
})

test("compress range rejects a JSON-encoded empty content array with the non-empty error", () => {
    assert.throws(
        () => normalizeRangeArgs({ topic: "Range fix", content: "[]" }),
        /content is required and must be a non-empty array/,
    )
})

test("compress range rejects a whole-args string with re-send guidance", () => {
    assert.throws(
        () => normalizeRangeArgs("Just a summary string."),
        (err: Error) => err.message.includes('"topic"') && err.message.includes('"content"'),
    )
})

test("compress range execute rejects the captured string-content payload with guidance", async () => {
    // Replay of a real-world failure captured from opencode sessions: the model
    // sent the summary as a plain `content` string and the tool errored with
    // "content is required and must be a non-empty array", forcing a retry.
    const tool = createCompressRangeTool({
        client: {},
        state: createSessionState(),
        logger: new Logger(false),
        config: { compress: { mode: "range" } } as PluginConfig,
        prompts: {
            reload() {},
            getRuntimePrompts() {
                return { compressRange: "", compressMessage: "" }
            },
        },
    } as any)

    await assert.rejects(
        tool.execute(
            {
                topic: "XKBNotFound bug diagnosis (Phases 1-4)",
                content:
                    "User bug report (verbatim intent): `just run` fails — xkbcommon-dl fails to dlopen libxkbcommon.so.0.",
            },
            {
                ask: async () => {},
                metadata: () => {},
                sessionID: "ses_string_content_replay",
                messageID: "msg-compress-string-content",
            },
        ),
        (err: Error) =>
            err.message.includes("JSON array") &&
            err.message.includes("startId") &&
            err.message.includes("endId"),
    )
})
