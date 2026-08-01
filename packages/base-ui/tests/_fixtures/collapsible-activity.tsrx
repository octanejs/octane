// An open, keyframe-animated Collapsible.Panel inside an <Activity> whose mode the test drives.
//
// This has to be a `.tsrx` fixture rather than `createElement` in the test: octane's `Activity`
// is a COMPILER-RECOGNIZED TAG, not a component function — `export const Activity: unique symbol`
// exists only so user imports resolve, and the compiler matches the tag by name. Passing that
// symbol to `createElement` throws "Element type is invalid".
//
// The animation is INLINE because jsdom's `getComputedStyle` does not resolve animations from a
// stylesheet rule (it reports `none`/`auto`) but does resolve inline ones — which is what makes
// the css-animation path observable here at all.
import { Activity } from 'octane';

import { Collapsible } from '../../src/collapsible';

const KEYFRAME_STYLE = {
	animationName: 'panel-slide-down',
	animationDuration: '100ms',
	animationTimingFunction: 'linear',
};

export function CollapsibleActivityHost(props: { mode: string }) @{
	<Activity mode={props.mode}>
		<Collapsible.Root defaultOpen>
			<Collapsible.Trigger data-slot-test="trigger">Toggle</Collapsible.Trigger>
			<Collapsible.Panel data-testid="panel" style={KEYFRAME_STYLE}>
				Panel body
			</Collapsible.Panel>
		</Collapsible.Root>
	</Activity>
}
