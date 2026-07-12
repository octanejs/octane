import { hydrate } from 'preact';
import { flushSync } from 'preact/compat';
import { App } from './App.jsx';

const container = document.getElementById('app');
if (!container) throw new Error('Missing #app root in index.html');

window.__hydrate = () => flushSync(() => hydrate(<App />, container));
window.__ready = true;
