export declare const NON_EMPTY_ARRAY_ERROR_MESSAGE = "content is required and must be a non-empty array";
export declare function isStringFields(value: unknown, keys: readonly string[]): boolean;
export declare function coerceContentArray<T>(raw: unknown, isEntry: (value: unknown) => value is T, guidance: string): T[];
export interface CompressArgsSpec<TEntry> {
    isEntry: (value: unknown) => value is TEntry;
    contentNoun: string;
    shapeExample: string;
    contentGuidance: string;
}
export declare function normalizeCompressArgs<TEntry>(args: unknown, spec: CompressArgsSpec<TEntry>): {
    topic: string;
    content: TEntry[];
};
export {};
