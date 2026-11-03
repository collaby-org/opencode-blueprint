/**
 * Normalizes model-emitted `content` arguments for the compress tools.
 *
 * Some models emit `content` as a single entry object or a JSON-encoded string
 * instead of the required array of entry objects. When the intent is
 * unambiguous we coerce it into the array form; when the payload is a plain
 * string (a summary with no range boundaries) we throw a guiding error that
 * tells the model exactly how to re-send the call.
 *
 * `coerceContentArray` does not check the shape of array elements; call sites
 * chain the tool's `validateArgs`, which reports the specific missing field.
 */
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
//# sourceMappingURL=args.d.ts.map