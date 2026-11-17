import '../../shared/api.js';
import '../../shared/probe.js';
import { createRoot } from 'octane';
import { start } from './router.ts';
import { App } from './App.tsrx';

start();
createRoot(document.getElementById('main')).render(App);
