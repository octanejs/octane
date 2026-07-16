import { createRoot } from 'octane';
import { App } from './App.tsrx';
import './styles.css';

if (window.location.pathname === '/') {
	history.replaceState(null, '', `/boards/launch${window.location.search}`);
}

const target = document.getElementById('root');
if (!target) throw new Error('missing #root');
createRoot(target).render(App);
