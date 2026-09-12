import { describe, expect, it } from 'vitest';
import * as ServerRT from 'octane/server';
import { flushSync, hydrateRoot } from '../src/index.js';
import { htext } from '../src/runtime.js';
import { mount } from './_helpers.js';
import { loadServerFixture } from './_server-fixture.js';
import {
	ForeignMath,
	ForeignSvg,
	FragmentTextRows,
	RootTextPair,
} from './_fixtures/dom-template-text.tsrx';

const rows = [
	{ id: 1, label: 'one', before: 'left-1', after: 'right-1' },
	{ id: 2, label: 'two', before: 'left-2', after: 'right-2' },
	{ id: 3, label: 'three', before: 'left-3', after: 'right-3' },
];

const nodeTriples = (container: HTMLElement) => {
	const nodes = [...container.querySelector('#rows')!.children];
	expect(nodes.length % 3).toBe(0);
	expect(nodes.map((node) => node.localName)).toEqual(
		['label', 'input', 'span', 'label', 'input', 'span', 'label', 'input', 'span'].slice(
			0,
			nodes.length,
		),
	);
	return Array.from({ length: nodes.length / 3 }, (_, index) =>
		nodes.slice(index * 3, index * 3 + 3),
	);
};

describe('compiled fragment and text children', () => {
	it('does not overwrite existing text when no compiler placeholder was seeded', () => {
		const host = document.createElement('octane-probe');
		const owned = document.createTextNode('owned:');
		host.appendChild(owned);
		const authored = htext(host, 'dynamic');
		expect(host.textContent).toBe('owned:dynamic');
		expect(host.firstChild).toBe(owned);
		expect(host.lastChild).toBe(authored);
	});

	it('keeps keyed multi-root nodes, text holes, and typed focus through updates and removal', () => {
		const r = mount(FragmentTextRows, { rows, tick: 'start' });
		let triples = nodeTriples(r.container);
		expect(triples.map(([label]) => label.textContent)).toEqual(['one', 'two', 'three']);
		for (const [label, , span] of triples) {
			expect([...label.childNodes].map((node) => node.nodeType)).toEqual([3]);
			expect([...span.childNodes].map((node) => node.nodeType)).toEqual([3, 1, 3]);
		}
		const initial = triples;
		const focused = initial[1][1] as HTMLInputElement;
		focused.value = 'typed';
		focused.focus();
		r.update(FragmentTextRows, { rows, tick: 'changed' });
		expect(r.find('output').textContent).toBe('changed');
		triples = nodeTriples(r.container);
		for (let index = 0; index < rows.length; index++) {
			for (let part = 0; part < 3; part++) expect(triples[index][part]).toBe(initial[index][part]);
		}

		const reversed = [...rows].reverse();
		r.update(FragmentTextRows, { rows: reversed, tick: 'reversed' });
		triples = nodeTriples(r.container);
		for (let index = 0; index < reversed.length; index++) {
			expect(triples[index][0]).toBe(initial[reversed[index].id - 1][0]);
			expect(triples[index][1]).toBe(initial[reversed[index].id - 1][1]);
			expect(triples[index][2]).toBe(initial[reversed[index].id - 1][2]);
			expect(triples[index][2].textContent).toBe(
				`${reversed[index].before}:${reversed[index].after}`,
			);
		}
		expect(focused.value).toBe('typed');
		expect(document.activeElement).toBe(focused);

		const empty = { ...rows[1], label: '', before: '', after: '' };
		r.update(FragmentTextRows, { rows: [empty], tick: 'small' });
		const [label, input, span] = nodeTriples(r.container)[0];
		expect(label).toBe(initial[1][0]);
		expect(input).toBe(focused);
		expect(label.textContent).toBe('');
		expect([...label.childNodes].map((node) => node.nodeType)).toEqual([3]);
		expect(span.textContent).toBe(':');
		expect([...span.childNodes].map((node) => node.nodeType)).toEqual([3, 1, 3]);
		expect(initial[0][0].isConnected).toBe(false);
		r.unmount();
		expect(focused.isConnected).toBe(false);
	});

	it('adopts multi-root and text nodes during hydration and updates the same nodes', () => {
		const server = loadServerFixture('packages/octane/tests/_fixtures/dom-template-text.tsrx');
		const props = { rows, tick: 'server' };
		const { html } = ServerRT.renderToString(server.FragmentTextRows, props);
		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = html;
		const before = nodeTriples(container);
		const text = before[0][0].firstChild;
		const siblingText = before[0][2].firstChild;
		const focused = before[1][1] as HTMLInputElement;
		focused.value = 'typed';
		focused.focus();
		const root = hydrateRoot(container, FragmentTextRows, props);
		flushSync(() => {});
		const after = nodeTriples(container);
		for (let index = 0; index < rows.length; index++) {
			for (let part = 0; part < 3; part++) expect(after[index][part]).toBe(before[index][part]);
		}
		expect(after[0][0].firstChild).toBe(text);
		expect(after[0][2].firstChild).toBe(siblingText);
		flushSync(() => root.render(FragmentTextRows, { rows: [...rows].reverse(), tick: 'client' }));
		expect(nodeTriples(container)[1][1]).toBe(focused);
		expect(focused.value).toBe('typed');
		expect(document.activeElement).toBe(focused);
		root.unmount();
		container.remove();
	});

	it('preserves direct fragment roots and foreign-content siblings', () => {
		const pair = mount(RootTextPair, { label: 'ready' });
		const first = pair.find('#first');
		const last = pair.find('#last');
		pair.update(RootTextPair, { label: '' });
		expect(pair.find('#first')).toBe(first);
		expect(first.textContent).toBe('');
		expect(first.firstChild?.nodeType).toBe(3);
		expect(pair.find('#last')).toBe(last);
		pair.unmount();

		const svg = mount(ForeignSvg, { label: 'S' });
		expect(svg.find('circle').namespaceURI).toBe('http://www.w3.org/2000/svg');
		expect(svg.find('text').namespaceURI).toBe('http://www.w3.org/2000/svg');
		expect(svg.find('text').textContent).toBe('S');
		svg.unmount();
		const math = mount(ForeignMath, { label: 'M' });
		expect(math.find('mn').namespaceURI).toBe('http://www.w3.org/1998/Math/MathML');
		expect(math.find('mn').textContent).toBe('M');
		math.unmount();
	});
});
