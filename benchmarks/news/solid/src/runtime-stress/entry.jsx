import { render } from '@solidjs/web';
import { flush } from 'solid-js';
import { installRuntimeStress } from '../../../../runtime-stress/shared.js';
import { App } from './App.jsx';

const container = document.getElementById('app');
if (!container) throw new Error('Missing runtime stress benchmark root');

const stress = installRuntimeStress();
render(() => <App />, container);
flush();
stress.ready = true;
