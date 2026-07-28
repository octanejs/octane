import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { installStoreSelectorStress } from '../../../../store-selector-fanout/shared.js';
import { App } from './App';

const container = document.getElementById('app');
if (!container) throw new Error('Missing store selector benchmark root');

const stress = installStoreSelectorStress();
stress.flush = (run: () => void) => flushSync(run);
const root = createRoot(container);
flushSync(() => root.render(createElement(App)));
stress.ready = true;
