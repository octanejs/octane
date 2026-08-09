import { createRoot } from 'octane';
import SpecializedStaticRoot from './root-static-specialized-component.tsrx';

createRoot(document.getElementById('octane-reachability-root')!).render(SpecializedStaticRoot);

export function run(container: HTMLElement) {
	return { text: container.textContent };
}
