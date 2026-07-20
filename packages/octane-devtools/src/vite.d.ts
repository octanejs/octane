import type { Plugin, ViteDevServer } from 'vite';

/**
 * The standalone Octane DevTools dev-server plugin: panel injection plus the
 * `/__octane_devtools/snapshot` relay. Serve-mode only (`apply: 'serve'`).
 * Pair it with the octane compiler plugin's `devtools: true`, which emits the
 * runtime bridge; `@octanejs/vite-plugin` composes both automatically.
 */
export declare function octaneDevtools(): Plugin;

export declare const VIRTUAL_DEVTOOLS_ID: 'virtual:octane-devtools';
export declare const RESOLVED_VIRTUAL_DEVTOOLS_ID: '\0virtual:octane-devtools';
export declare const DEVTOOLS_SNAPSHOT_PATH: '/__octane_devtools/snapshot';

export declare function create_devtools_entry_source(): string;
export declare function create_devtools_snapshot_middleware(
	vite: ViteDevServer,
	timeoutMs?: number,
): (req: unknown, res: unknown, next: () => void) => void;
