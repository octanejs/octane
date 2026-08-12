import { createRoot, useState } from 'octane';
import {
	HexAlphaColorPicker,
	HexColorInput,
	HexColorPicker,
	HsvaColorPicker,
	setNonce,
} from '@octanejs/colorful';

setNonce('browser-colorful');

function AuxPicker(props: { id: string }) {
	const [color, setColor] = useState('#ff0000');
	return <section data-aux={props.id}>
		<output data-aux-color={props.id}>{color}</output>
		<HexColorPicker color={color} onChange={setColor} />
	</section>;
}

function mountShadow() {
	if (document.querySelector('#shadow-host')) return;
	const host = document.createElement('div');
	host.id = 'shadow-host';
	document.body.appendChild(host);
	const shadow = host.attachShadow({ mode: 'open' });
	const container = document.createElement('div');
	shadow.appendChild(container);
	createRoot(container).render(AuxPicker, { id: 'shadow' });
}

function mountFrame() {
	if (document.querySelector('#frame-host')) return;
	const frame = document.createElement('iframe');
	frame.id = 'frame-host';
	document.body.appendChild(frame);
	const frameDocument = frame.contentDocument!;
	frameDocument.body.innerHTML = '<div id="frame-root"></div>';
	createRoot(frameDocument.querySelector('#frame-root')!).render(AuxPicker, { id: 'frame' });
}

function App() {
	const [color, setColor] = useState('#ff0000');
	const [commits, setCommits] = useState(0);
	const [hsva, setHsva] = useState({ h: 0, s: 100, v: 100, a: 0 });
	return <main>
		<h1>react-colorful browser parity</h1>
		<output id="color">{color}</output>
		<output id="commits">{String(commits)}</output>
		<HexColorPicker
			color={color}
			onChange={setColor}
			onChangeEnd={() => setCommits((value) => value + 1)}
			data-testid="picker"
		/>
		<HexAlphaColorPicker color="#ff000080" data-testid="alpha-picker" />
		<output id="hsva">{JSON.stringify(hsva)}</output>
		<HsvaColorPicker color={hsva} onChange={setHsva} data-testid="hsva-picker" />
		<HexColorInput color={color} onChange={setColor} prefixed data-testid="input" />
		<button id="mount-shadow" onClick={mountShadow}>Mount ShadowRoot</button>
		<button id="mount-frame" onClick={mountFrame}>Mount iframe</button>
	</main>;
}

createRoot(document.querySelector('#root')!).render(App);
