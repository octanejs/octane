import { createVaporApp, nextTick } from 'vue';
import { installRuntimeStress } from '../../../../runtime-stress/shared.js';
import App from './App.vue';

const container = document.getElementById('app');
if (!container) throw new Error('Missing runtime stress benchmark root');

const stress = installRuntimeStress();
createVaporApp(App).mount(container);
void nextTick().then(() => {
	stress.ready = true;
});
