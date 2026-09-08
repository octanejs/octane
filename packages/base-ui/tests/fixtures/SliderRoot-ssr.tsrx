import * as React from 'octane';
import { DirectionProvider, type TextDirection } from '@octanejs/base-ui/direction-provider';
import { Field } from '@octanejs/base-ui/field';
import { Slider } from '@octanejs/base-ui/slider';
import { Form } from '@octanejs/base-ui/form';
import { platform } from '@octanejs/base-ui-utils/platform';

export function SliderRootServerCase1() {
	return <Slider.Root defaultValue={30} data-testid="root">
		<Slider.Label data-testid="label">Volume</Slider.Label>
		<Slider.Control>
			<Slider.Track>
				<Slider.Thumb />
			</Slider.Track>
		</Slider.Control>
	</Slider.Root>;
}
