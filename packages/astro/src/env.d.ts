/// <reference types="astro/client" />

declare module 'astro:octane:opts' {
	import type { VirtualModuleOptions } from '../types/index.d.ts';
	const opts: VirtualModuleOptions;
	export default opts;
}
