import { createRoot, flushSync } from 'octane';
import { StyleLiteralWork } from './StyleLiteralWork.tsrx';

const mode = new URL(location.href).searchParams.get('case') || 'single';
if (mode !== 'single' && mode !== 'multi' && mode !== 'generic' && mode !== 'interleaved') {
	throw new Error(`Unknown inline style benchmark case: ${mode}`);
}
const target = document.getElementById('main');
if (!target) throw new Error('missing #main root');

createRoot(target).render(StyleLiteralWork, { mode });
window.__benchFlush = () => flushSync(() => {});
