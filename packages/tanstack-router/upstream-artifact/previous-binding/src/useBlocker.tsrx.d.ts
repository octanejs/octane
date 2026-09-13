// Type declaration for the .tsrx module (resolved by relative path).
import type { HistoryAction } from '@tanstack/history';

export interface ShouldBlockFnLocation {
	routeId: string;
	fullPath: string;
	pathname: string;
	params: Record<string, string>;
	search: Record<string, any>;
}

export type BlockerResolver =
	| {
			status: 'blocked';
			current: ShouldBlockFnLocation;
			next: ShouldBlockFnLocation;
			action: HistoryAction;
			proceed: () => void;
			reset: () => void;
	  }
	| {
			status: 'idle';
			current: undefined;
			next: undefined;
			action: undefined;
			proceed: undefined;
			reset: undefined;
	  };

export type ShouldBlockFnArgs = {
	current: ShouldBlockFnLocation;
	next: ShouldBlockFnLocation;
	action: HistoryAction;
};

export type ShouldBlockFn = (args: ShouldBlockFnArgs) => boolean | Promise<boolean>;

export type UseBlockerOpts = {
	shouldBlockFn: ShouldBlockFn;
	enableBeforeUnload?: boolean | (() => boolean);
	disabled?: boolean;
	withResolver?: boolean;
};

type LegacyBlockerFn = () => Promise<any> | any;
type LegacyBlockerOpts = {
	blockerFn?: LegacyBlockerFn;
	condition?: boolean | any;
};

export type PromptProps = (UseBlockerOpts | LegacyBlockerOpts) & {
	children?: unknown | ((params: BlockerResolver) => unknown);
};

export declare const useBlocker: (
	opts?: UseBlockerOpts | LegacyBlockerOpts | LegacyBlockerFn,
	condition?: boolean | any,
) => BlockerResolver;
export declare const Block: (props: PromptProps) => unknown;
