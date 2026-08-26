import type { TimeToFirstDrawRenderable } from '@opentui/core';
import {
	defineUniversalComponent,
	universalPlan,
	universalProps,
	universalValue,
} from 'octane/universal';
import { OPENTUI_RENDERER_ID } from './config.js';
import type { TimeToFirstDrawProps } from './types.js';

export type { TimeToFirstDrawProps } from './types.js';

const TIME_TO_FIRST_DRAW_PLAN = universalPlan(OPENTUI_RENDERER_ID, {
	kind: 'host',
	type: 'time-to-first-draw',
	propsSlot: 0,
});

export const TimeToFirstDraw = defineUniversalComponent<TimeToFirstDrawProps>(
	OPENTUI_RENDERER_ID,
	(props) => universalValue(TIME_TO_FIRST_DRAW_PLAN, [universalProps([['spread', props]])]),
	{ module: '@octanejs/opentui' },
);
