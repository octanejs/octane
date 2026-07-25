/** @jsxImportSource octane */
import { useState } from 'octane';
import { Dialog } from '@octanejs/base-ui/dialog';
import { Separator } from '@octanejs/base-ui/separator';
import { Slider } from '@octanejs/base-ui/slider';

import { useIsHydrating } from '../../../src/utils/useIsHydrating';

export function BaseHydrationFixture() {
	const isHydrating = useIsHydrating();
	const [clicks, setClicks] = useState(0);

	return (
		<main id="base-ui-server">
			<output id="base-ui-render-phase">{isHydrating ? 'server' : 'client'}</output>
			<Separator id="base-ui-server-separator" orientation="vertical" />
			<button id="base-ui-hydration-button" onClick={() => setClicks((count) => count + 1)}>
				{'Clicks: ' + clicks}
			</button>
		</main>
	);
}

export function BaseEdgeSliderFixture() {
	return (
		<Slider.Root id="base-ui-edge-slider" defaultValue={30} thumbAlignment="edge">
			<Slider.Control id="base-ui-edge-control">
				<Slider.Track id="base-ui-edge-track">
					<Slider.Indicator id="base-ui-edge-indicator" />
					<Slider.Thumb id="base-ui-edge-thumb" />
				</Slider.Track>
			</Slider.Control>
		</Slider.Root>
	);
}

export function BaseClosedDialogFixture() {
	return (
		<Dialog.Root>
			<Dialog.Trigger id="base-ui-server-dialog-trigger">Open dialog</Dialog.Trigger>
		</Dialog.Root>
	);
}
