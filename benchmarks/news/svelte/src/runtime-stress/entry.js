import { flushSync, mount } from 'svelte';
import { installRuntimeStress } from '../../../../runtime-stress/shared.js';
import App from './App.svelte';

const container = document.getElementById('app');
if (!container) throw new Error('Missing runtime stress benchmark root');

const stress = installRuntimeStress();
flushSync(() => mount(App, { target: container }));
stress.ready = true;
