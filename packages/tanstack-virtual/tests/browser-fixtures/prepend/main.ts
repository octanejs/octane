import { createRoot } from 'octane';
import { DirectPrepend } from '../../_fixtures/direct-prepend.tsrx';
const mode =
	new URLSearchParams(location.search).get('mode') === 'position' ? 'position' : 'transform';
createRoot(document.querySelector('#root')!).render(DirectPrepend, { mode });
