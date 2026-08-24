import { ThinkingOrb } from '@octanejs/thinking-orbs';
import { createRoot, useState } from 'octane';

function App() {
	const [paused, setPaused] = useState(false);
	const [dark, setDark] = useState(false);
	return <main>
		<div id="theme-host" class={dark ? 'dark' : 'light'}>
			<ThinkingOrb state="connecting" size={64} theme="auto" paused={paused} data-testid="orb" />
		</div>
		<button id="toggle-paused" onClick={() => setPaused((value) => !value)}>
			Toggle pause
		</button>
		<button id="toggle-theme" onClick={() => setDark((value) => !value)}>
			Toggle theme
		</button>
		<output id="paused">{String(paused)}</output>
		<output id="dark">{String(dark)}</output>
	</main>;
}

createRoot(document.querySelector('#root')!).render(App);
