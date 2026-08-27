import { render } from 'inferno';
import { installBrowserBenchmark } from '../../shared/browser.js';
import { App } from './App.jsx';

const target = document.getElementById('main');

installBrowserBenchmark(target, () => {
	render(<App />, target);
});
