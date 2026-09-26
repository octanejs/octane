import { hydrateRoot as hydrate } from 'octane';
import { Shell } from './shell.tsrx';
import './fixture.css';
import rawWidget from './widgets.tsrx?raw';

const container = document.querySelector('#root')!;
hydrate(container, Shell, { show: true });
const selected = globalThis.location.hash ? Shell : Shell;
hydrate(container, selected, { show: true });
function shadow(hydrate: (...args: unknown[]) => unknown) {
	return hydrate(container, Shell);
}
globalThis.addEventListener('hashchange', () => shadow(() => {}));
document.documentElement.dataset.rawFixtureLength = String(rawWidget.length);
