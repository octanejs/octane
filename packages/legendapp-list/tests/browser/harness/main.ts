import { mount } from 'legend-harness-mount';

import { harness } from './bridge.ts';
import { snapshot } from './observe.ts';
import * as scenarios from './scenarios.tsrx';

declare global {
	interface Window {
		__snapshot: typeof snapshot;
		__ready: boolean;
	}
}

const name = new URL(location.href).searchParams.get('scenario') ?? 'Basic';
const Scenario = (scenarios as Record<string, any>)[name];
if (!Scenario) throw new Error(`Unknown scenario ${name}`);
window.__snapshot = snapshot;
mount(document.getElementById('root')!, Scenario);
window.__ready = true;
void harness;
