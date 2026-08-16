export interface DshHomeInstanceLock {
    readonly path: string;
    release(): void;
}
export interface DshHomeInstanceLockOptions {
    pid?: number;
    token?: string;
    acquiredAt?: string;
    isProcessAlive?: (pid: number) => boolean;
}
export declare function acquireDshHomeInstanceLock(dshHome: string, options?: DshHomeInstanceLockOptions): DshHomeInstanceLock;
//# sourceMappingURL=instance-lock.d.ts.map