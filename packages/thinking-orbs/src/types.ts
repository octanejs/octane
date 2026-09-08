import type { Octane } from 'octane/jsx-runtime';

export type CSSProperties = Exclude<
	Octane.JSX.IntrinsicElements['canvas']['style'],
	string | undefined
>;

export type OrbState =
	| 'working'
	| 'searching'
	| 'solving'
	| 'listening'
	| 'connecting'
	| 'weaving'
	| 'composing'
	| 'breathing'
	| 'shaping';

export type OrbSize = 64 | 20;

export type OrbTheme = 'auto' | 'dark' | 'light';

export interface ThinkingOrbProps extends Omit<
	Octane.JSX.IntrinsicElements['canvas'],
	'style' | 'ref'
> {
	state?: OrbState;
	size?: OrbSize;
	theme?: OrbTheme;
	speed?: number;
	paused?: boolean;
	style?: CSSProperties;
	ref?: Octane.JSX.IntrinsicElements['canvas']['ref'];
}
