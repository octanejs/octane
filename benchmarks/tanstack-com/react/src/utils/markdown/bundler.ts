/**
 * Shared types and constants for bundler tabs.
 * Used by both the rehype tabs transform and the BundlerTabs component.
 */

export const BUNDLERS = ['vite', 'rsbuild'] as const;

export type Bundler = (typeof BUNDLERS)[number];

export const DEFAULT_BUNDLER: Bundler = 'vite';

export const BUNDLER_LABELS: Record<Bundler, string> = {
	vite: 'Vite',
	rsbuild: 'Rsbuild',
};

export function isBundler(value: string): value is Bundler {
	return (BUNDLERS as ReadonlyArray<string>).includes(value);
}
