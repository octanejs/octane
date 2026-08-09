/**
 * Optional renderer coordination without importing either renderer runtime.
 *
 * Native-only and DOM-only applications must never retain the opposite runtime
 * merely because another renderer can participate in the same application.
 */
export type RendererHostFlusher = <T>(run: () => T) => T;

type RendererContextProvider = (
	context: unknown,
	props: { value: unknown; children?: unknown },
	scope: object,
) => unknown;

let clientContextProvider: RendererContextProvider | undefined;
let serverContextProvider: RendererContextProvider | undefined;
let hostFlusher: RendererHostFlusher | undefined;
const rendererContexts = new WeakSet<Function>();

/** Brand renderer-local contexts without observing authored function properties. */
export function registerRendererContext(context: Function): void {
	rendererContexts.add(context);
}

/** Recognize only renderer-local Providers at a dynamic JSX descriptor boundary. */
export function isRendererContext(value: Function): boolean {
	return rendererContexts.has(value);
}

/** Install the client adapters only after a real DOM root becomes active. */
export function registerClientRendererBridge(
	contextProvider: RendererContextProvider,
	flush: RendererHostFlusher,
): void {
	clientContextProvider = contextProvider;
	hostFlusher = flush;
}

/** Server rendering can coexist with the client runtime in the same process. */
export function registerServerRendererContextProvider(provider: RendererContextProvider): void {
	serverContextProvider = provider;
}

/** Render a renderer-local context through the owner matching its actual scope. */
export function renderRendererContextProvider(
	context: unknown,
	props: { value: unknown; children?: unknown },
	scope: object,
): unknown {
	const provider = 'block' in scope ? clientContextProvider : serverContextProvider;
	if (provider === undefined) {
		throw new Error('A renderer-local context provider requires an active renderer owner.');
	}
	return provider(context, props, scope);
}

/** Read the optional owner scheduler without importing the DOM runtime. */
export function getRendererHostFlusher(): RendererHostFlusher | undefined {
	return hostFlusher;
}
