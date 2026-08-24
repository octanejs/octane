import type {
	BaseLocationHook,
	BaseSearchHook,
	HrefsFormatter,
	Path,
	SearchString,
} from './location-hook';

export type Parser = (route: Path, loose?: boolean) => { pattern: RegExp; keys: string[] };

export type NavigateOptions<S = any> = {
	replace?: boolean;
	state?: S;
	transition?: boolean;
};

export type AroundNavHandler = (
	navigate: (to: Path, options?: NavigateOptions) => void,
	to: Path,
	options?: NavigateOptions,
) => void;

export interface RouterObject {
	readonly hook: BaseLocationHook;
	readonly searchHook: BaseSearchHook;
	readonly base: Path;
	readonly ownBase: Path;
	readonly parser: Parser;
	readonly ssrPath?: Path;
	readonly ssrSearch?: SearchString;
	readonly ssrContext?: SsrContext;
	readonly hrefs: HrefsFormatter;
	readonly aroundNav: AroundNavHandler;
}

export type SsrContext = {
	redirectTo?: Path;
	statusCode?: number;
};

export type RouterOptions = {
	hook?: BaseLocationHook;
	searchHook?: BaseSearchHook;
	base?: Path;
	parser?: Parser;
	ssrPath?: Path;
	ssrSearch?: SearchString;
	ssrContext?: SsrContext;
	hrefs?: HrefsFormatter;
	aroundNav?: AroundNavHandler;
};
