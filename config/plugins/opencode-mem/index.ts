// Local path wrapper around opencode-mem.
//
// Why a wrapper: the npm plugin cache installed opencode-mem into a nested
// tree that came out incomplete twice (missing @libsql/client and
// @huggingface/transformers after an ENOSPC), and OpenCode then failed the
// whole plugin with "Cannot find package".
//
// Why the dependency lives in the config home, not here: the Bun loader
// resolves bare specifiers from <config>/node_modules — the same reason
// @opencode-ai/plugin is installed there as the central fallback. A local
// node_modules next to this file is never consulted, so `opencode-mem/v2`
// resolves against the config home, where bin/setup.mjs pins it. Installing
// it here instead produces a large tree the loader cannot see.
//
// The package ships a dedicated v2 entrypoint (dist/v2/plugin.js, exported as
// "opencode-mem/v2"). Re-export it so OpenCode loads the v2 shape directly.
export { default } from "opencode-mem/v2";
