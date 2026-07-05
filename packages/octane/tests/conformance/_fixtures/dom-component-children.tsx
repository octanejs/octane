import { createElement } from 'octane';

// De-opt (createElement descriptor) fixtures for dom-component-children.test.ts.
// React's ReactDOMComponent-test.js flips the SAME <div> between string content,
// dangerouslySetInnerHTML, and element children across renders. Octane's compiled
// templates can't change prop SHAPE on one element, but the de-opt reconciler
// (reconcileDeoptNode / patchDeoptProps) patches a reused element in place — the
// closest analogue of React's updateComponent path.

// mode 'html' → dangerouslySetInnerHTML; mode 'text' → plain string child.
export function DeoptContent(props: { mode: string; html?: string; text?: string }) {
	if (props.mode === 'html') {
		return createElement('div', {
			id: 'dc',
			dangerouslySetInnerHTML: { __html: props.html },
		});
	}
	return createElement('div', { id: 'dc' }, props.text);
}

// Nested variant: outer <div> keeps its identity, inner flips between raw HTML
// and element children.
export function NestedDeoptContent(props: { mode: string }) {
	return createElement(
		'div',
		{ id: 'nd' },
		props.mode === 'html'
			? createElement('div', { dangerouslySetInnerHTML: { __html: 'bonjour' } })
			: createElement('div', null, createElement('span', null, 'adieu')),
	);
}

// Malformed dangerouslySetInnerHTML shapes (React throws; the value must be
// `{__html: …}`). `d` is passed through verbatim.
export function MalformedDanger(props: { d: unknown }) {
	return createElement('div', { id: 'md', dangerouslySetInnerHTML: props.d });
}

// children AND dangerouslySetInnerHTML together (React throws — mutually exclusive).
export function ChildrenPlusDanger(props: { on: boolean }) {
	if (!props.on) return createElement('div', { id: 'cpd' });
	return createElement('div', {
		id: 'cpd',
		children: 'kid',
		dangerouslySetInnerHTML: { __html: 'raw' },
	});
}

// Invalid tag names — document.createElement must reject these natively.
export function BadTag(props: { tag: string }) {
	return createElement(props.tag);
}
