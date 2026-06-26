// React-style app entry. Mirrors playground/octane: createRoot + render the App
// (which provides the QueryClient and renders the router). The styled sheet is
// imported once for the whole app.
import 'virtual:stylex.css';
import { createRoot } from 'octane';
import { App } from './App.js';

const container = document.getElementById('app');
if (!container) throw new Error('Missing #app root in index.html');

createRoot(container).render(App);
