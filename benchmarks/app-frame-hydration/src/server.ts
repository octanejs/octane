import { renderToString } from 'octane/server';
import { AppFrame, BoundedAppFrame } from './frame.tsrx';
import { FRAME_PROPS, frameData, SCENARIOS, type Scenario } from './state';

export function renderFrame(scenario: Scenario): string {
	return renderToString(scenario === 'frame-boundaries' ? BoundedAppFrame : AppFrame, {
		...FRAME_PROPS,
		...SCENARIOS[scenario],
		data: frameData(),
	}).html;
}
