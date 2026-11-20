import { createRoot, flushSync } from 'octane';
import { Badge, Clicker } from './reexported-components-index.ts';

// Components imported through a plain `.ts` re-export index keep the void
// call-site proof a direct `.tsrx` import gets, so neither the generic
// component slot's host-string tag body nor the host descriptor renderer
// reaches the bundle.
function App(props: { label: string }) @{
	<main id="minimal-reexports">
		<Badge label={props.label} />
		<Clicker start={1} />
	</main>
}

export function run(container: HTMLElement) {
	const root = createRoot(container);
	flushSync(() => root.render(App, { label: 'a' }));
	const before = container.textContent;
	flushSync(() => container.querySelector('button')!.click());
	flushSync(() => root.render(App, { label: 'b' }));
	const after = container.textContent;
	root.unmount();
	return { before, after, cleaned: container.childNodes.length === 0 };
}
