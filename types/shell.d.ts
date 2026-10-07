// Declarations for things @girs/gnome-shell doesn't cover.
declare module 'resource:///org/gnome/shell/ui/grabHelper.js' {
    export class GrabHelper {
        constructor(owner: any, params?: any);
        grab(params: {actor: any; focus?: any; onUngrab?: () => void}): boolean;
        ungrab(params?: {actor?: any}): void;
    }
}

declare const console: {log(...args: any[]): void; error(...args: any[]): void};
declare class TextDecoder {decode(input?: Uint8Array | ArrayBuffer): string}
declare class TextEncoder {encode(input?: string): Uint8Array}
