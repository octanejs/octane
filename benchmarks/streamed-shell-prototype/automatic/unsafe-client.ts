import { createRoot } from 'octane';
import { UnsafeShell } from './UnsafeShell.tsrx';

createRoot(document.getElementById('root')!).render(UnsafeShell, {});
