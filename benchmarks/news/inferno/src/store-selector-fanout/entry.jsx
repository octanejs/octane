import { render, rerender } from 'inferno';
import { installStoreSelectorStress } from '../../../../store-selector-fanout/shared.js';
import { App } from './App.jsx';

const container = document.getElementById('app');
if (!container) throw new Error('Missing store selector benchmark root');

const stress = installStoreSelectorStress();
stress.flush = (run) => {
	run();
	rerender();
	return Promise.resolve();
};
render(<App />, container);
stress.ready = true;
