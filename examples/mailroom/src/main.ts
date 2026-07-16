import { createRoot } from 'octane';
import { App } from './App.tsrx';
import './styles.css';

if (window.location.pathname === '/') {
	history.replaceState(null, '', `/mail/inbox${window.location.search}`);
}

const target = document.getElementById('root');
if (target === null) throw new Error('Mailroom requires a #root element.');
createRoot(target).render(App);
