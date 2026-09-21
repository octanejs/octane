import { createRoot } from 'octane';
import { MeasuredDrawer } from './measured-drawer.tsrx';

declare global {
	interface Window {
		drawerLayoutErrors: string[];
	}
}

window.drawerLayoutErrors = [];
window.addEventListener('error', (event) => window.drawerLayoutErrors.push(event.message));

createRoot(document.getElementById('root')!).render(MeasuredDrawer);
