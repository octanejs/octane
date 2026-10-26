import { createRoot, flushSync, type OctaneNode } from 'octane';

// Renderable holes over text, an array, a returned component descriptor and
// lexical children. Nothing builds a host element descriptor, so the host
// descriptor renderer must not reach the bundle.
function Badge(props: { label: string }) @{
	<em>{props.label as string}</em>
}

function Status(props: { ready: boolean }) {
	return props.ready ? <Badge label="ready" /> : 'pending';
}

function Panel(props: { items: string[]; children?: OctaneNode }) @{
	<section id="minimal-holes">
		<p>{props.items}</p>
		<Status ready={props.items.length > 1} />
		{props.children}
	</section>
}

function App(props: { items: string[] }) @{
	<Panel items={props.items}>
		<i>{'children'}</i>
	</Panel>
}

export function run(container: HTMLElement) {
	const root = createRoot(container);
	flushSync(() => root.render(App, { items: ['a'] }));
	const before = container.textContent;
	flushSync(() => root.render(App, { items: ['a', 'b'] }));
	const after = container.textContent;
	root.unmount();
	return { before, after, cleaned: container.childNodes.length === 0 };
}
