import type { Octane } from 'octane/jsx-runtime';

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

type CanvasProps = Octane.JSX.IntrinsicElements['canvas'];

export type OrbStyle = Exclude<CanvasProps['style'], string | undefined>;

export interface ThinkingOrbProps extends Omit<CanvasProps, 'ref' | 'style'> {
	/** Which animation to show. @default 'working' */
	state?: OrbState;
	/** Tuned size preset — 64 or 20 CSS px. @default 64 */
	size?: OrbSize;
	/** Theme mode; `auto` detects from the host project. @default 'auto' */
	theme?: OrbTheme;
	/** Animation speed multiplier on top of the preset's baked speed. @default 1 */
	speed?: number;
	/** Freeze the animation on the current frame. @default false */
	paused?: boolean;
	style?: OrbStyle;
}
