import { createRoot } from 'octane';
import ChainedRoot from './root-chained-jsx-component.tsrx';

// The Vite-template entry shape: a chained root rendering an element.
createRoot(document.getElementById('octane-reachability-root')!).render(
	<ChainedRoot title="Octane" />,
);

export function run(container: HTMLElement) {
	return { text: container.textContent };
}
