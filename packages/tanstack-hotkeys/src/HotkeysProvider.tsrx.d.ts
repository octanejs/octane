// Type declaration for the .tsrx provider component (HotkeysProvider.tsrx).
// It's a SPECIFIC module declaration (resolved by relative path), not an ambient
// `declare module '*.tsrx'` — so it types only this module and doesn't pollute a
// consumer's own .tsrx imports. The runtime resolves the real compiled .tsrx.
import type { HotkeysProviderOptions } from './context';

export interface HotkeysProviderProps {
	children: unknown;
	defaultOptions?: HotkeysProviderOptions;
}

export declare function HotkeysProvider(props: HotkeysProviderProps): unknown;
