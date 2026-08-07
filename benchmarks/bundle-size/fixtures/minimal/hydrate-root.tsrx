import { hydrateRoot } from 'octane';

function HydratedRoot(props: { value: string }) @{
	<main id="minimal-hydrated-root">{props.value as string}</main>
}

export async function run(container: HTMLElement) {
	container.innerHTML = '<main id="minimal-hydrated-root">server</main>';
	const serverNode = container.firstElementChild;
	const root = hydrateRoot(container, HydratedRoot, { value: 'server' });
	const adopted = container.firstElementChild === serverNode;
	const before = container.textContent;
	root.render(HydratedRoot, { value: 'client' });
	await Promise.resolve();
	const after = container.textContent;
	root.unmount();
	return { adopted, before, after, cleaned: container.childNodes.length === 0 };
}
