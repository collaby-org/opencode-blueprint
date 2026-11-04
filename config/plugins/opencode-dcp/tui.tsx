/** @jsxImportSource @opentui/solid */

import type { TuiPluginModule } from "@opencode-ai/plugin/tui"
import { registerCommands } from "./lib/tui/commands"
import { loadConfig } from "./lib/tui/data"
import { openPanelModal } from "./lib/tui/modals"
import type { Plugin } from "@opencode/plugin/tui"
import { startNotifyToasts } from "./lib/ui/notify-queue"
import { setup } from "./lib/v2/tui"

const tui: TuiPluginModule["tui"] = async (api) => {
    // Server reports (compress/prune results) as transient toasts. Polls the
    // notify queue the server plugin appends to; on hosts with the rpc event
    // bus this runs alongside (records there never reach the queue).
    startNotifyToasts(api)

    const config = loadConfig(api)
    if (!config.enabled || !config.commands.enabled) return

    registerCommands(api, [
        {
            title: "DCP",
            name: "dcp.panel",
            description: "Open DCP panel",
            slashName: "dcp",
            run: () => openPanelModal(api, config),
        },
    ])
}

export default {
    id: "opencode-dcp",
    setup,
    tui,
} satisfies TuiPluginModule & Plugin.Definition
