import { render } from '@solidjs/web';
import { flush } from 'solid-js';
import { installStoreSelectorStress } from '../../../../store-selector-fanout/shared.js';
import { App } from './App.jsx';

const container = document.getElementById('app');
if (!container) throw new Error('Missing store selector benchmark root');

const stress = installStoreSelectorStress();
stress.flush = (run) => {
	run();
	flush();
};
render(() => <App />, container);
flush();
stress.ready = true;
