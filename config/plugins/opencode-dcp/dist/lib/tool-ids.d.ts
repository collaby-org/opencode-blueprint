import type { WithParts } from "./state";
type ToolPart = Extract<WithParts["parts"][number], {
    type: "tool";
}>;
export declare function getAmbiguousToolIds(messages: WithParts[]): Set<string>;
export declare function toolOccurrenceKey(message: WithParts, part: ToolPart): string;
export {};
