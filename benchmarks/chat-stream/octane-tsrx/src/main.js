import { createRoot } from 'octane';
import { ChatApp } from './Main.tsrx';

const target = document.getElementById('main');
if (!target) throw new Error('missing #main root');

createRoot(target).render(ChatApp);
