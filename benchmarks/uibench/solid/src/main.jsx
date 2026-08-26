import { render } from '@solidjs/web';
import { flush } from 'solid-js';
import App from './App.jsx';
import { caseByName } from '../../shared/workloads.js';
import { clearSetter, commit } from '../../shared/bridge.js';
import '../../octane-tsrx/src/style.css';

const target = document.getElementById('main');
if (!target) throw new Error('missing #main root');

let dispose = null;

window.__mount = () => {
	dispose = render(() => <App />, target);
	flush();
};

window.__reset = () => {
	if (dispose !== null) dispose();
	dispose = null;
	clearSetter();
	while (target.firstChild) target.removeChild(target.firstChild);
};

window.__prepare = (name) => {
	commit(caseByName(name).before);
	flush();
};
window.__run = (name) => {
	commit(caseByName(name).after);
	flush();
};
window.__ready = true;
