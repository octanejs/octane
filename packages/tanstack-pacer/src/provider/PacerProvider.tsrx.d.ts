// Type declaration for the .tsrx provider component (PacerProvider.tsrx).
// It's a SPECIFIC module declaration (resolved by relative path), not an ambient
// `declare module '*.tsrx'` — so it types only this module and doesn't pollute a
// consumer's own .tsrx imports. The runtime resolves the real compiled .tsrx.
import type { PacerProviderOptions } from './context';

export interface PacerProviderProps {
	children: unknown;
	defaultOptions?: PacerProviderOptions;
}

export declare function PacerProvider(props: PacerProviderProps): unknown;
