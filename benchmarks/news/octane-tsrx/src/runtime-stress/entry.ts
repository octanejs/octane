import { createRoot, flushSync } from 'octane';
import { installRuntimeStress } from '../../../../runtime-stress/shared.js';
import { App } from './App.tsrx';

const container = document.getElementById('app');
if (!container) throw new Error('Missing runtime stress benchmark root');

const stress = installRuntimeStress();
const root = createRoot(container);
root.render(App, {});
flushSync(() => {});
stress.ready = true;
