import type { SessionState, WithParts } from "../../state"
import type { Logger } from "../../logger"
import type { PluginConfig } from "../../config"
import type { RuntimePrompts } from "../../prompts/store"
import { formatMessageIdTag } from "../../message-ids"
import type { CompressionPriorityMap } from "../priority"
import { compressPermission } from "../../compress-permission"
import {
    getLastUserMessage,
    isIgnoredUserMessage,
    isProtectedUserMessage,
    messageHasCompress,
} from "../query"
import { saveSessionState } from "../../state/persistence"
import {
    appendToTextPart,
    appendToLastTextPart,
    appendToAllToolParts,
    createSyntheticTextPart,
    hasContent,
} from "../utils"
import {
    addAnchor,
    applyAnchoredNudges,
    countMessagesAfterIndex,
    findLastNonIgnoredMessage,
    getIterationNudgeThreshold,
    getNudgeFrequency,
    getModelInfo,
    isContextOverLimits,
} from "./utils"

export const injectCompressNudges = (
    state: SessionState,
    config: PluginConfig,
    logger: Logger,
    messages: WithParts[],
    prompts: RuntimePrompts,
    compressionPriorities?: CompressionPriorityMap,
    createAnchors = true,
): void => {
    if (compressPermission(state, config) === "deny") {
        return
    }

    const { providerId, modelId } = getModelInfo(messages)
    const { overMaxLimit, overMinLimit } = isContextOverLimits(
        config,
        state,
        providerId,
        modelId,
        messages,
    )

    // Hard wall for manual mode: manual mode suppresses the soft turn/iteration
    // nudges, but never the provider window-limit one. Returning early for any
    // truthy manualMode meant a stuck `"compress-pending"` value (or a leaked
    // persisted one) also cancelled the context-limit anchor, so once the
    // context grew past the provider's window every request was rejected with
    // `context_length` exceeded and no compress tool call could ever succeed.
    if (state.manualMode && !overMaxLimit) {
        return
    }

    if (!createAnchors) {
        applyAnchoredNudges(state, config, messages, prompts, compressionPriorities)
        return
    }

    const lastMessage = findLastNonIgnoredMessage(messages)
    const lastAssistantMessage = messages.findLast((message) => message.info.role === "assistant")

    if (lastAssistantMessage && messageHasCompress(lastAssistantMessage)) {
        state.nudges.contextLimitAnchors.clear()
        state.nudges.turnNudgeAnchors.clear()
        state.nudges.iterationNudgeAnchors.clear()
        void saveSessionState(state, logger)
        return
    }

    // `providerId`/`modelId` and the limit checks were hoisted above the
    // manual-mode wall, so they are computed once here.
    let anchorsChanged = false

    if (!overMinLimit) {
        const hadTurnAnchors = state.nudges.turnNudgeAnchors.size > 0
        const hadIterationAnchors = state.nudges.iterationNudgeAnchors.size > 0

        if (hadTurnAnchors || hadIterationAnchors) {
            state.nudges.turnNudgeAnchors.clear()
            state.nudges.iterationNudgeAnchors.clear()
            anchorsChanged = true
        }
    }

    if (overMaxLimit) {
        if (lastMessage) {
            const interval = getNudgeFrequency(config)
            const added = addAnchor(
                state.nudges.contextLimitAnchors,
                lastMessage.message.info.id,
                lastMessage.index,
                messages,
                interval,
            )
            if (added) {
                anchorsChanged = true
            }
        }
    } else if (overMinLimit && !state.manualMode) {
        const isLastMessageUser = lastMessage?.message.info.role === "user"

        if (isLastMessageUser && lastAssistantMessage) {
            const previousSize = state.nudges.turnNudgeAnchors.size
            state.nudges.turnNudgeAnchors.add(lastMessage.message.info.id)
            state.nudges.turnNudgeAnchors.add(lastAssistantMessage.info.id)
            if (state.nudges.turnNudgeAnchors.size !== previousSize) {
                anchorsChanged = true
            }
        }

        const lastUserMessage = getLastUserMessage(messages)
        if (lastUserMessage && lastMessage) {
            const lastUserMessageIndex = messages.findIndex(
                (message) => message.info.id === lastUserMessage.info.id,
            )
            if (lastUserMessageIndex >= 0) {
                const messagesSinceUser = countMessagesAfterIndex(messages, lastUserMessageIndex)
                const iterationThreshold = getIterationNudgeThreshold(config)

                if (
                    lastMessage.index > lastUserMessageIndex &&
                    messagesSinceUser >= iterationThreshold
                ) {
                    const interval = getNudgeFrequency(config)
                    const added = addAnchor(
                        state.nudges.iterationNudgeAnchors,
                        lastMessage.message.info.id,
                        lastMessage.index,
                        messages,
                        interval,
                    )

                    if (added) {
                        anchorsChanged = true
                    }
                }
            }
        }
    }

    applyAnchoredNudges(state, config, messages, prompts, compressionPriorities)

    if (anchorsChanged) {
        void saveSessionState(state, logger)
    }
}

export const injectMessageIds = (
    state: SessionState,
    config: PluginConfig,
    messages: WithParts[],
    compressionPriorities?: CompressionPriorityMap,
): void => {
    if (compressPermission(state, config) === "deny") {
        return
    }

    for (const message of messages) {
        if (isIgnoredUserMessage(message)) {
            continue
        }

        const messageRef = state.messageIds.byRawId.get(message.info.id)
        if (!messageRef) {
            continue
        }

        const isBlockedMessage = isProtectedUserMessage(config, message)
        const priority =
            config.compress.mode === "message" && !isBlockedMessage
                ? compressionPriorities?.get(message.info.id)?.priority
                : undefined
        const tag = formatMessageIdTag(
            isBlockedMessage ? "BLOCKED" : messageRef,
            priority ? { priority } : undefined,
            state.idFormat,
        )

        if (message.info.role === "user") {
            let injected = false
            for (const part of message.parts) {
                if (part.type === "text") {
                    injected = appendToTextPart(part, tag) || injected
                }
            }

            if (injected) {
                continue
            }

            message.parts.push(createSyntheticTextPart(message, tag))
            continue
        }

        if (message.info.role !== "assistant") {
            continue
        }

        if (!hasContent(message)) {
            continue
        }

        if (appendToAllToolParts(message, tag)) {
            continue
        }

        if (appendToLastTextPart(message, tag)) {
            continue
        }

        const syntheticPart = createSyntheticTextPart(message, tag)
        const firstToolIndex = message.parts.findIndex((p) => p.type === "tool")
        if (firstToolIndex === -1) {
            message.parts.push(syntheticPart)
        } else {
            message.parts.splice(firstToolIndex, 0, syntheticPart)
        }
    }
}
