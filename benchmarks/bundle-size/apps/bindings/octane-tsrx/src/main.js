import { createRoot } from 'octane';
import { SettingsApp } from './App.tsrx';

const target = document.getElementById('main');
if (!target) throw new Error('missing #main root');

createRoot(target).render(SettingsApp);
