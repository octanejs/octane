import { createElement, render } from 'preact';
import { flushSync } from 'preact/compat';
import { installStoreSelectorStress } from '../../../../store-selector-fanout/shared.js';
import { App } from './App.jsx';

const container = document.getElementById('app');
if (!container) throw new Error('Missing store selector benchmark root');

const stress = installStoreSelectorStress();
stress.flush = (run) => flushSync(run);
flushSync(() => render(createElement(App), container));
stress.ready = true;
