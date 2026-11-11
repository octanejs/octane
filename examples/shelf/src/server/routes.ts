/** Which requests the Shelf server answers, decided by path alone so a host can pass the rest on. */
import { is_rpc_request } from '@octanejs/app-core/middleware';

export type Page = 'octane' | 'react';

/** Server-rendered pages, by path, with their HTML file. The mixed page is rendered in the browser only. */
export const PAGES: Record<string, { page: Page; file: string }> = {
	'/': { page: 'octane', file: 'index.html' },
	'/index.html': { page: 'octane', file: 'index.html' },
	'/react.html': { page: 'react', file: 'react.html' },
};

/** A page, or a browser's call to a server function. */
export const isShelfPath = (pathname: string) =>
	Object.hasOwn(PAGES, pathname) || is_rpc_request(pathname);
