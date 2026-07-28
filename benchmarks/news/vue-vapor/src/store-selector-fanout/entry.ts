import { createVaporApp, nextTick } from 'vue';
import { installStoreSelectorStress } from '../../../../store-selector-fanout/shared.js';
import App from './App.vue';

const container = document.getElementById('app');
if (!container) throw new Error('Missing store selector benchmark root');

const stress = installStoreSelectorStress();
stress.flush = async (run: () => void) => {
	run();
	await nextTick();
};
createVaporApp(App).mount(container);
void nextTick().then(() => {
	stress.ready = true;
});
