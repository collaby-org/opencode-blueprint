export interface DcpSlashRoute {
    readonly type: string;
    readonly sessionID?: string;
}
export declare function dispatchDcpServerCommand(input: {
    readonly route: DcpSlashRoute;
    readonly name: "dcp" | "dcp-compress";
    readonly text: string | undefined;
    readonly command: (input: {
        sessionID: string;
        name: string;
        text: string;
    }) => Promise<unknown>;
    readonly open: () => Promise<void> | void;
    readonly fail: (cause: unknown) => void;
}): Promise<void>;
export {};
