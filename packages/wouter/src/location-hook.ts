export type Path = string;
export type PathPattern = string | RegExp;
export type SearchString = string;

export type HrefsFormatter = (href: string, router?: unknown) => string;

export type BaseLocationHook = {
	(...args: any[]): [Path, (path: Path, ...args: any[]) => any];
	searchHook?: BaseSearchHook;
	hrefs?: HrefsFormatter;
};

export type BaseSearchHook = (...args: any[]) => SearchString;

export type HookReturnValue<H extends BaseLocationHook> = ReturnType<H>;

type EmptyInterfaceWhenAnyOrNever<T> = 0 extends 1 & T
	? Record<never, never>
	: [T] extends [never]
		? Record<never, never>
		: T;

export type HookNavigationOptions<H extends BaseLocationHook> = EmptyInterfaceWhenAnyOrNever<
	NonNullable<Parameters<HookReturnValue<H>[1]>[1]>
>;
