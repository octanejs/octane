import { createElement, render } from 'preact';
import { flushSync } from 'preact/compat';
import { installRuntimeStress } from '../../../../runtime-stress/shared.js';
import { App } from './App.jsx';

const container = document.getElementById('app');
if (!container) throw new Error('Missing runtime stress benchmark root');

const stress = installRuntimeStress();
flushSync(() => render(createElement(App), container));
stress.ready = true;
