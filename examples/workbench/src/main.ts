import { createRoot } from 'octane';
import { App } from './App.tsrx';
import { installBrowserBridge } from './bridge';
import './styles.css';

const target = document.getElementById('root');
if (target === null) throw new Error('Workbench requires a #root element');

createRoot(target).render(App, { mode: installBrowserBridge() });
