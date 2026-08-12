import { HexAlphaColorPicker, HexColorInput, HexColorPicker } from '@octanejs/colorful';

export function ServerColorful() {
	return <main>
		<h1>Color controls</h1>
		<HexColorPicker color="#ff0000" data-testid="hex" />
		<HexAlphaColorPicker color="#ff000080" data-testid="alpha" />
		<HexColorInput color="#aabbcc" prefixed data-testid="input" />
	</main>;
}
