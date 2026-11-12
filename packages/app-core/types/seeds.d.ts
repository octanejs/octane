/**
 * The text a server render seeded under `name` with `routeSeed`, or `null`
 * when there is none, such as on a page rendered only in the browser. Read it
 * once the document has been parsed.
 */
export function readRouteSeed(name: string): string | null;
export { routeSeed } from '@octanejs/app-core';
