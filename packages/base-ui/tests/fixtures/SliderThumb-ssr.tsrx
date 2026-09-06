import * as React from 'octane';
import { Slider } from '@octanejs/base-ui/slider';
import { Field } from '@octanejs/base-ui/field';
import { platform } from '@octanejs/base-ui-utils/platform';

export function SliderThumbServerCase1() {
	return <Slider.Root
		defaultValue={30}
		style={{
			width: '100px',
		}}
	>
		<Slider.Value />
		<Slider.Control>
			<Slider.Track>
				<Slider.Indicator />
				<Slider.Thumb data-testid="thumb" />
			</Slider.Track>
		</Slider.Control>
	</Slider.Root>;
}

export function SliderThumbServerCase2() {
	return <Slider.Root
		defaultValue={30}
		thumbAlignment="edge"
		style={{
			width: '100px',
		}}
	>
		<Slider.Value />
		<Slider.Control>
			<Slider.Track>
				<Slider.Indicator />
				<Slider.Thumb data-testid="thumb" />
			</Slider.Track>
		</Slider.Control>
	</Slider.Root>;
}

export function SliderThumbServerCase3() {
	return <Slider.Root
		defaultValue={[30, 40]}
		thumbAlignment="edge"
		style={{
			width: '100px',
		}}
	>
		<Slider.Value />
		<Slider.Control>
			<Slider.Track>
				<Slider.Thumb index={0} data-testid="thumb" />
				<Slider.Thumb index={1} data-testid="thumb" />
			</Slider.Track>
		</Slider.Control>
	</Slider.Root>;
}

export function SliderThumbServerCase4() {
	return <Slider.Root
		defaultValue={[30, 40]}
		style={{
			width: '100px',
		}}
	>
		<Slider.Value />
		<Slider.Control>
			<Slider.Track>
				<Slider.Thumb index={0} data-testid="thumb" />
				<Slider.Thumb index={1} data-testid="thumb" />
			</Slider.Track>
		</Slider.Control>
	</Slider.Root>;
}
