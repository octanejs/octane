import { Skeleton } from '@octanejs/boneyard';
import { createRoot, useState } from 'octane';

const responsive = {
	breakpoints: {
		200: { name: 'small', width: 200, height: 90, bones: [[5, 10, 90, 20, 4]] },
		600: { name: 'wide', width: 600, height: 180, bones: [[10, 20, 80, 40, 8]] },
	},
} as const;

function App() {
	const [wide, setWide] = useState(false);
	const [dark, setDark] = useState(false);
	return <main>
		<div id="shell" class={dark ? 'dark' : ''} style={{ width: wide ? '700px' : '300px' }}>
			<Skeleton
				loading
				initialBones={responsive}
				animate={false}
				color="rgb(230, 230, 230)"
				darkColor="rgb(20, 20, 20)"
			/>
		</div>
		<button id="toggle-width" onClick={() => setWide((value) => !value)}>Toggle width</button>
		<button id="toggle-theme" onClick={() => setDark((value) => !value)}>Toggle theme</button>
	</main>;
}

createRoot(document.querySelector('#root')!).render(App);
