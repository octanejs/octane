import { createRoot, flushSync } from 'octane';
import { installRuntimeStress } from '../../../../runtime-stress/shared.js';
import { EventWorkNoCapture } from './EventWorkNoCapture.tsrx';

const container = document.getElementById('app');
if (!container) throw new Error('Missing delegated-event benchmark root');

const stress = installRuntimeStress();
const root = createRoot(container);
root.render(EventWorkNoCapture, {});
flushSync(() => {});
stress.ready = true;
