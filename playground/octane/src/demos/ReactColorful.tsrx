import { HexAlphaColorPicker, HexColorInput } from '@octanejs/colorful';
import { useState } from 'octane';

export function ReactColorfulDemo() @{
	const [color, setColor] = useState('#7c3aedcc');
	<div>
		<h2 class="demo-title">{'react-colorful on Octane'}</h2>
		<p
			class="demo-blurb"
		>{'One controlled color value shared by the alpha picker and text input.'}</p>
		<div class="panel" style={{ display: 'grid', gap: '1rem', justifyItems: 'start' }}>
			<HexAlphaColorPicker color={color} onChange={setColor} />
			<HexColorInput color={color} alpha prefixed onChange={setColor} aria-label="Color" />
			<output style={{ color, fontFamily: 'monospace' }}>{color}</output>
		</div>
	</div>
}
