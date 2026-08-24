import * as ThinkingOrbs from 'thinking-orbs';
import * as ThinkingOrbsEngine from 'thinking-orbs/engine';
import {
	ThinkingOrb,
	MODE_DRAWS,
	STATE_TO_MODE,
	resolvePreset,
	type OrbSize,
	type OrbState,
	type OrbTheme,
	type ModeKey,
	type ThinkingOrbProps,
} from 'thinking-orbs';
import { MODE_FRAMES, finalizeFrame, type OrbFrame } from 'thinking-orbs/engine';

declare function expectType<T>(value: T): void;

ThinkingOrbs satisfies object;
ThinkingOrbsEngine satisfies object;
expectType<ModeKey>(STATE_TO_MODE.working);
expectType<number>(resolvePreset('searching', 64).speed);
expectType<Function>(MODE_DRAWS.orbits);
expectType<Function>(MODE_FRAMES.morph);
expectType<OrbFrame>(finalizeFrame([], []));
expectType<OrbState>('breathing');
expectType<OrbSize>(20);
expectType<OrbTheme>('auto');
expectType<ThinkingOrbProps>({ state: 'working', size: 64, paused: true });
expectType<Function>(ThinkingOrb);

// @ts-expect-error thinking-orbs ships only the two tuned sizes
const invalidSize: OrbSize = 32;
void invalidSize;
