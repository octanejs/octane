import { createRoot } from 'octane';
import { scan, setOptions } from '../../src/index.ts';
import { App } from './app.tsrx';

scan();
createRoot(document.querySelector('#root')!).render(App);

// Test hook: lets the driver flip options without reaching into modules.
(window as unknown as { __scan: { setOptions: typeof setOptions } }).__scan = { setOptions };
