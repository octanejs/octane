import * as ThinkingOrbs from '@octanejs/thinking-orbs';
import * as ThinkingOrbsEngine from '@octanejs/thinking-orbs/engine';
import {
	ThinkingOrb,
	MODE_DRAWS,
	STATE_TO_MODE,
	resolvePreset,
	type OrbSize,
	type OrbState,
	type OrbStyle,
	type OrbTheme,
	type ModeKey,
	type ThinkingOrbProps,
} from '@octanejs/thinking-orbs';
import {
	MODE_FRAMES,
	finalizeFrame,
	makeProj,
	paint,
	paintFrame,
	paintLines,
	radiusScale,
	type Dot,
	type Line,
	type ModeDraw,
	type ModeFrame,
	type ModeOpts,
	type OrbFrame,
} from '@octanejs/thinking-orbs/engine';
import type { OctaneNode } from 'octane';

declare function expectType<T>(value: T): void;

ThinkingOrbs satisfies object;
ThinkingOrbsEngine satisfies object;
expectType<(props: ThinkingOrbProps) => OctaneNode>(ThinkingOrb);
expectType<OrbState>('working');
expectType<OrbSize>(64);
expectType<OrbTheme>('dark');
expectType<OrbStyle>({ display: 'block' });
expectType<ThinkingOrbProps>({ state: 'shaping', size: 20, theme: 'auto' });
expectType<ModeKey>(STATE_TO_MODE.working);
expectType<number>(resolvePreset('working', 64).speed);
expectType<ModeDraw>(MODE_DRAWS.orbits);
expectType<ModeFrame>(MODE_FRAMES.orbits);
expectType<OrbFrame>(finalizeFrame([], []));
expectType<ReturnType<typeof makeProj>>(makeProj(0, 0, 0, 0, 1));
expectType<void>(paint(null as unknown as CanvasRenderingContext2D, [], false));
expectType<void>(paintLines(null as unknown as CanvasRenderingContext2D, [], false));
expectType<void>(
	paintFrame(null as unknown as CanvasRenderingContext2D, { dots: [], lines: [] }, false),
);
expectType<number>(radiusScale(64, 0.6));
expectType<Dot>({ x: 0, y: 0, z: 0, r: 1, white: 0 });
expectType<Line>({ x1: 0, y1: 0, x2: 1, y2: 1, white: 0, w: 1 });
expectType<ModeOpts>({ rMin: 0.3 });

// @ts-expect-error public sizes are deliberately limited to tuned presets
const invalidSize: OrbSize = 32;
void invalidSize;
