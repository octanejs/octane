import { useState } from 'octane';
import { HexColorInput, HexColorPicker } from '@octanejs/colorful';

export function ColorfulDiff(props: { initial: string }) {
	const [color, setColor] = useState(props.initial);
	const [commits, setCommits] = useState(0);
	const [showInput, setShowInput] = useState(true);
	return <section>
		<output id="color">{color}</output>
		<output id="commits">{String(commits)}</output>
		<HexColorPicker
			color={color}
			onChange={setColor}
			onChangeEnd={() => setCommits((value) => value + 1)}
			data-testid="picker"
		/>
		<button id="hide-input" onClick={() => setShowInput(false)}>Hide input</button>
		@if (showInput) {
			<HexColorInput color={color} onChange={setColor} prefixed data-testid="input" />
		}
	</section>;
}
