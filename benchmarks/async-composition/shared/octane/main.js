import { createRoot } from 'octane';
import { installBrowserBenchmark } from '../browser.js';
import { App } from './App.tsrx';

const target = document.getElementById('main');
let root;

installBrowserBenchmark(target, () => {
	root = createRoot(target);
	root.render(App);
});
