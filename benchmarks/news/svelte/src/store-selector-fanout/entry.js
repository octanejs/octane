import { flushSync, mount } from 'svelte';
import { installStoreSelectorStress } from '../../../../store-selector-fanout/shared.js';
import App from './App.svelte';

const container = document.getElementById('app');
if (!container) throw new Error('Missing store selector benchmark root');

const stress = installStoreSelectorStress();
stress.flush = (run) => flushSync(run);
flushSync(() => mount(App, { target: container }));
stress.ready = true;
