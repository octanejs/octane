import { Register } from '@tanstack/octane-router';
import { RequestHandler } from '@tanstack/octane-start/server';
export type ServerEntry = {
    fetch: RequestHandler<Register>;
};
export declare function createServerEntry(entry: ServerEntry): ServerEntry;
declare const _default: ServerEntry;
export default _default;
