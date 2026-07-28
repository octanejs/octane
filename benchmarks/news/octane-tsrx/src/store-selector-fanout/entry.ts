import { createRoot, flushSync } from 'octane';
import { installStoreSelectorStress } from '../../../../store-selector-fanout/shared.js';
import { App } from './App.tsrx';

const container = document.getElementById('app');
if (!container) throw new Error('Missing store selector benchmark root');

const stress = installStoreSelectorStress();
stress.flush = (run: () => void) => flushSync(run);
const root = createRoot(container);
root.render(App, {});
flushSync(() => {});
stress.ready = true;
