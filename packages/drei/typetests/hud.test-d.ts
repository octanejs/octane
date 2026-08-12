import { Hud, type HudProps } from '../src/index.js';

const props: HudProps = { children: null, renderPriority: 2 };
Hud;
props;

// @ts-expect-error render priority is numeric
const invalidPriority: HudProps = { children: null, renderPriority: 'front' };
