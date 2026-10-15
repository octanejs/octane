import { createRoot, Hydrate } from 'octane';
import { never } from 'octane/hydration';

function StaticPage() @{
	<main>
		<p>Client shell</p>
		<Hydrate split={false} when={never()}>
			<p>Server-owned content</p>
		</Hydrate>
	</main>
}

export function run(container: HTMLElement) {
	const root = createRoot(container);
	root.render(StaticPage);
	const text = container.textContent;
	root.unmount();
	return { text, cleaned: container.childNodes.length === 0 };
}
