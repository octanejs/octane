import { createRoot } from 'octane';
import { TodoApp } from './Main.tsrx';

const target = document.getElementById('main');
if (!target) throw new Error('missing #main root');

createRoot(target).render(TodoApp);
