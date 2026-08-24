import type { OctaneNode } from 'octane';
import { ThinkingOrb as ThinkingOrbImplementation } from './ThinkingOrb.tsrx';
import type { ThinkingOrbProps } from './types';

export const ThinkingOrb: (props: ThinkingOrbProps) => OctaneNode = ThinkingOrbImplementation;
export type { OrbSize, OrbState, OrbStyle, OrbTheme, ThinkingOrbProps } from './types';
export { resolvePreset, STATE_TO_MODE, type ModeKey, type Resolved } from './presets';
export { MODE_DRAWS } from './engine/registry';
