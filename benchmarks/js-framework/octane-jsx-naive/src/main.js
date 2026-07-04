import { createRoot } from 'octane';
import Main from './Main.tsx';

const target = document.getElementById('main');
if (!target) throw new Error('missing #main root');

createRoot(target).render(Main);
