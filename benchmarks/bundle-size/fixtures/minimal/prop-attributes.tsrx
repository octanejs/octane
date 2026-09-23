import { createRoot, useState } from 'octane';

let clicks = 0;

// Opaque props lower to potential signal bindings even in a signal-free module.
// Their statically named attributes must keep only the narrow scalar writers.
function PropLink(props: { label: string; href: string }) @{
	const [count, setCount] = useState(0);
	<a
		id="minimal-prop-link"
		title={props.label}
		href={props.href}
		data-count={count}
		onClick={(event: MouseEvent) => {
			event.preventDefault();
			clicks++;
			setCount(count + 1);
		}}
	>{props.label as string}</a>
}

export async function run(container: HTMLElement) {
	const root = createRoot(container);
	root.render(PropLink, { label: 'Octane', href: 'javascript:void 0' });
	await Promise.resolve();
	const link = container.querySelector('#minimal-prop-link') as HTMLAnchorElement;
	const unsafeHref = link.getAttribute('href');
	root.render(PropLink, { label: 'Docs', href: '/docs' });
	await Promise.resolve();
	link.click();
	await Promise.resolve();
	const snapshot = {
		sanitized: unsafeHref !== null && !unsafeHref.startsWith('javascript:void'),
		title: link.getAttribute('title'),
		href: link.getAttribute('href'),
		text: link.textContent,
		count: link.getAttribute('data-count'),
		clicks,
	};
	root.unmount();
	return { ...snapshot, cleaned: container.childNodes.length === 0 };
}
