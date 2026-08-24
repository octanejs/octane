/** @jsxImportSource octane */
import { useState } from 'octane';

import { ColorArea, ColorThumb, ColorWheel, ColorWheelTrack } from '../../src/components';

export function ColorWheelNativeInputScenario() {
	const [value, setValue] = useState('unchanged');

	return (
		<div>
			<ColorWheel
				aria-label="Hue"
				defaultValue="hsl(0, 100%, 50%)"
				innerRadius={30}
				outerRadius={50}
				onChange={(color) => setValue(color.toString('hsl'))}
			>
				<ColorWheelTrack>
					<ColorThumb />
				</ColorWheelTrack>
			</ColorWheel>
			<output data-testid="wheel-value">{value}</output>
		</div>
	);
}

export function ColorAreaNativeInputScenario() {
	const [value, setValue] = useState('unchanged');

	return (
		<div>
			<ColorArea
				aria-label="Saturation and lightness"
				colorSpace="hsl"
				defaultValue="hsl(0, 100%, 50%)"
				xChannel="saturation"
				yChannel="lightness"
				onChange={(color) => setValue(color.toString('hsl'))}
			>
				<ColorThumb />
			</ColorArea>
			<output data-testid="area-value">{value}</output>
		</div>
	);
}
