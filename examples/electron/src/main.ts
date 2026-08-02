import { createRoot } from 'octane';
import { App } from './App.tsrx';
import { installBrowserBridge } from './bridge';
import './styles.css';

const target = document.getElementById('root');
if (target === null) throw new Error('Electron Shell requires a #root element');

const mode = installBrowserBridge();

async function runTask(id: string): Promise<void> {
	const bridge = (window as any).__OCTANE_ELECTRON__;
	if (bridge == null) throw new Error('Electron bridge is missing');
	await bridge.invoke('run_task', { id });
}

createRoot(target).render(App, { mode, runTask });
