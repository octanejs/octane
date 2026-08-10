/**
 * Lynx runtime globals used by this example.
 *
 * `SystemInfo` exists in both Lynx runtimes. The `__*` Element PAPI functions
 * exist only in the main-thread runtime and may be referenced only inside
 * `'main thread'` functions.
 */
declare const SystemInfo: {
	readonly pixelWidth: number;
	readonly pixelHeight: number;
	readonly pixelRatio: number;
	readonly platform: string;
};

declare function __AddInlineStyle(element: object, name: string, value: string): void;
declare function __FlushElementTree(): void;
declare function __InvokeUIMethod(
	element: object,
	method: string,
	params: Readonly<Record<string, boolean | number | string>>,
	callback: (result: { code: number; data?: unknown }) => void,
): void;
