import { Plugin as Plugin$1 } from '@opencode-ai/plugin';
import { Plugin } from '@opencode/plugin';

declare function setup(ctx: Plugin.Context): Promise<(() => void) | undefined>;

declare const _default: {
    id: string;
    setup: typeof setup;
    server: Plugin$1;
};

export { _default as default };
