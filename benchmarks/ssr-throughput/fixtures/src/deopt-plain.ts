import { createElement } from 'octane/server';
import { CARDS } from './deopt-data';
import type { CardData } from './deopt-data';

// DE-OPT authoring of the deopt page: plain .ts building `createElement`
// descriptor trees — no .tsrx, no compiled templates, exactly the shape the
// @octanejs bindings hand to octane. On the server every node here is
// serialized interpretively: host descriptors through ssrHostElement (per-key
// ssrAttrEntry loop instead of compile-time-baked static attrs), component
// descriptors through ssrComponent, component-bearing children through
// ssrDeoptBlockChildren (extra hydration block markers), arrays through the
// per-item block path in ssrChild.
//
// MUST stay structurally identical to DeoptFast.tsrx (same tags, same attr
// ORDER, same component boundaries, same shared CARDS data) — the harness
// strips comment markers from both bodies and requires byte equality.

// Loosely-typed alias: descriptor-returning plain components aren't the
// compiled ServerComponent shape TS expects, and fixture builds don't typecheck.
const h = createElement as (type: any, props?: any, ...children: any[]) => any;

function Avatar(props: { initials: string; hue: number }) {
	return h(
		'span',
		{ class: 'avatar', style: { background: 'hsl(' + props.hue + ',60%,50%)' } },
		props.initials,
	);
}

function Card(props: { c: CardData }) {
	const c = props.c;
	return h(
		'article',
		{
			class: ['card', c.theme, { featured: c.featured }],
			'data-id': c.id,
			...c.meta,
			style: { width: c.width + 'px' },
		},
		h(Avatar, { initials: c.initials, hue: c.hue }),
		h('h3', { class: 'name' }, c.name),
		h('p', { class: 'role' }, c.role),
		h(
			'ul',
			{ class: 'tags' },
			c.tags.map((t) => h('li', { key: t, class: 'tag' }, t)),
		),
	);
}

export function DeoptPagePlain() {
	return h(
		'main',
		{ class: 'grid' },
		h('h1', { class: 'head' }, 'Deopt page - ' + CARDS.length + ' cards'),
		CARDS.map((c) => h(Card, { key: c.id, c })),
	);
}
