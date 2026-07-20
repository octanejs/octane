// @tsrx/prettier-plugin ships untyped JS (src/index.js). It is a standard
// Prettier plugin module — type it as one so the playground formatter's
// dynamic import stays fully typed (no `any` leaks).
declare module '@tsrx/prettier-plugin' {
	import type { Plugin } from 'prettier';

	export const languages: Plugin['languages'];
	export const parsers: NonNullable<Plugin['parsers']>;
	export const printers: NonNullable<Plugin['printers']>;
}
