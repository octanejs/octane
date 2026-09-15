import * as Orbs from 'thinking-orbs';

const state: Orbs.OrbState = 'connecting';
const size: Orbs.OrbSize = 20;
const theme: Orbs.OrbTheme = 'auto';
const resolved: Orbs.Resolved = Orbs.resolvePreset(state, size);
const mode: Orbs.ModeKey = Orbs.STATE_TO_MODE[state];
declare const context: CanvasRenderingContext2D;
Orbs.MODE_DRAWS[mode](context, size, 0.6, false, resolved.opts);
const props: Orbs.ThinkingOrbProps = { state, size, theme, paused: true, 'aria-label': 'Loading' };
const accepted: Parameters<typeof Orbs.ThinkingOrb>[0] = props;
// @ts-expect-error Only the upstream state names are accepted.
Orbs.resolvePreset('unknown', 20);
// @ts-expect-error Only the two tuned sizes are accepted.
const invalidSize: Orbs.ThinkingOrbProps = { size: 32 };
// @ts-expect-error A resolved preset is precise, not any.
const invalidSpeed: string = resolved.speed;

import type { Assert, Equal } from '../../../../scripts/react-port/type-assertions.js';
type StateNames = Assert<
	Equal<
		Orbs.OrbState,
		| 'working'
		| 'searching'
		| 'solving'
		| 'listening'
		| 'connecting'
		| 'weaving'
		| 'composing'
		| 'breathing'
		| 'shaping'
	>
>;
type SizeValues = Assert<Equal<Orbs.OrbSize, 20 | 64>>;
type ThemeValues = Assert<Equal<Orbs.OrbTheme, 'auto' | 'light' | 'dark'>>;
type ModeNames = Assert<
	Equal<
		Orbs.ModeKey,
		'orbits' | 'globe' | 'rubik' | 'wave' | 'web' | 'braid' | 'ribbon' | 'ring' | 'morph'
	>
>;
type ComponentSize = Assert<
	Equal<NonNullable<Parameters<typeof Orbs.ThinkingOrb>[0]['size']>, 20 | 64>
>;
type PropsSpeed = Assert<Equal<Orbs.ThinkingOrbProps['speed'], number | undefined>>;
type ResolvedSpeed = Assert<Equal<Orbs.Resolved['speed'], number>>;
type PresetSignature = Assert<
	Equal<typeof Orbs.resolvePreset, (state: Orbs.OrbState, size: Orbs.OrbSize) => Orbs.Resolved>
>;
type StateModeMap = Assert<Equal<typeof Orbs.STATE_TO_MODE, Record<Orbs.OrbState, Orbs.ModeKey>>>;
type DrawContext = Assert<
	Equal<Parameters<(typeof Orbs.MODE_DRAWS)[Orbs.ModeKey]>[0], CanvasRenderingContext2D>
>;

type PresetReturnSpeed = Assert<Equal<ReturnType<typeof Orbs.resolvePreset>['speed'], number>>;
type WorkingMode = Assert<
	Equal<
		(typeof Orbs.STATE_TO_MODE)['working'],
		'orbits' | 'globe' | 'rubik' | 'wave' | 'web' | 'braid' | 'ribbon' | 'ring' | 'morph'
	>
>;
type OrbitDrawContext = Assert<
	Equal<Parameters<(typeof Orbs.MODE_DRAWS)['orbits']>[0], CanvasRenderingContext2D>
>;
