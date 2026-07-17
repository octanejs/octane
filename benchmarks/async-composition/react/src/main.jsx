import { createRoot } from 'react-dom/client';
import { installBrowserBenchmark } from '../../shared/browser.js';
import { App } from './App.jsx';

const target = document.getElementById('main');
let root;

installBrowserBenchmark(target, () => {
	root = createRoot(target);
	root.render(<App />);
});
