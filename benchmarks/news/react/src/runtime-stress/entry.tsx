import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { installRuntimeStress } from '../../../../runtime-stress/shared.js';
import { App } from './App';

const container = document.getElementById('app');
if (!container) throw new Error('Missing runtime stress benchmark root');

const stress = installRuntimeStress();
const root = createRoot(container);
flushSync(() => root.render(createElement(App)));
stress.ready = true;
