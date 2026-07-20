import type { Register } from '@octanejs/tanstack-router';
import type { RequestHandler } from './server.js';

export type ServerEntry = {
	fetch: RequestHandler<Register>;
};

export declare function createServerEntry(entry: ServerEntry): ServerEntry;

declare const defaultEntry: ServerEntry;
export default defaultEntry;
