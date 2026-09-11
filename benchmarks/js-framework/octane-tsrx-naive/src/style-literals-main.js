import { createRoot, flushSync } from 'octane';
import { StyleLiteralWork } from './StyleLiteralWork.tsrx';
import { colorEvaluations } from './style-literal-values.js';

const mode = new URL(location.href).searchParams.get('case') || 'single';
if (
	!['single', 'multi', 'generic', 'interleaved', 'duplicateStatic', 'duplicateDynamic'].includes(
		mode,
	)
) {
	throw new Error(`Unknown inline style benchmark case: ${mode}`);
}
const target = document.getElementById('main');
if (!target) throw new Error('missing #main root');

createRoot(target).render(StyleLiteralWork, { mode });
window.__benchFlush = () => flushSync(() => {});
window.__benchColorEvaluations = () => colorEvaluations;
