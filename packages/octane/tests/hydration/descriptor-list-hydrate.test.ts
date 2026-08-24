import { afterEach, describe, expect, it, vi } from 'vitest';
import * as ServerRuntime from 'octane/server';
import { flushSync, hydrateRoot } from '../../src/index.js';
import { loadCompiledFixtureSource } from '../_server-fixture.js';

const FIXTURE = `
import { createElement, Fragment, useState } from 'octane';

export function NativeRows(props) @{
	<ul id="descriptor-list">
		@for (const item of props.items; key item.id) {
			<li data-id={item.id} ref={props.refs[item.id]}>
				<input data-input={item.id} defaultValue={item.label} />
				<button data-pick={item.id} onClick={() => props.onPick(item.id)}>
					{item.label as string}
				</button>
			</li>
		}
	</ul>
}

export function DescriptorRows(props) @{
	const rows = props.items.map((item) =>
		createElement(
			'li',
			{ key: item.id, 'data-id': item.id, ref: props.refs[item.id] },
			createElement('input', { 'data-input': item.id, defaultValue: item.label }),
			createElement(
				'button',
				{ 'data-pick': item.id, onClick: () => props.onPick(item.id) },
				item.label,
			),
		),
	);
	<ul id="descriptor-list">{rows}</ul>
}

function StatefulRow(props) @{
	const [count, setCount] = useState(0);
	<li data-id={props.item.id}>
		<button data-counter={props.item.id} onClick={() => setCount(count + 1)}>
			{(props.item.label + ':' + count) as string}
		</button>
	</li>
}

function StatefulBadge(props) @{
	const [count, setCount] = useState(0);
	<button data-counter={props.item.id} onClick={() => setCount(count + 1)}>
		{(props.item.label + ':' + count) as string}
	</button>
}

export function MixedDescriptorRows(props) @{
	const rows = props.items.map((item) => {
		if (item.kind === 'component') {
			return createElement(StatefulRow, { key: item.id, item });
		}
		if (item.kind === 'nested') {
			return createElement(
				'li',
				{ key: item.id, 'data-id': item.id },
				createElement(StatefulBadge, { item }),
			);
		}
		if (item.kind === 'fragment') {
			return createElement(
				Fragment,
				{ key: item.id },
				createElement('li', { 'data-id': item.id }, item.label),
			);
		}
		if (item.kind === 'text') return item.label;
		if (item.kind === 'empty') return null;
		return createElement('li', { key: item.id, 'data-id': item.id }, item.label);
	});
	<ol id="mixed-descriptor-list">{rows}</ol>
}

export function NamespaceDescriptorRows(props) @{
	const svg = props.items.map((item) =>
		createElement(
			item.kind === 'foreign' ? 'foreignObject' : 'g',
			{ key: item.id, 'data-svg-row': item.id },
			createElement(
				item.kind === 'foreign' ? 'div' : 'text',
				{ 'data-svg-label': item.id },
				item.label,
			),
		),
	);
	const math = props.items.map((item) =>
		createElement('mi', { key: item.id, 'data-math-row': item.id }, item.label),
	);
	<main id="namespace-descriptor-list">
		<svg id="descriptor-svg">{svg}</svg>
		<math id="descriptor-math">{math}</math>
	</main>
}

function ProxyInner(props) @{
	<strong data-proxy-inner="">{props.label as string}</strong>
}

export function ProxyDescriptorRows(props) @{
	const dynamicChild = () =>
		props.renderFunction
			? () => createElement(ProxyInner, { label: props.label })
			: createElement(ProxyInner, { label: props.label });
	let first;
	if (props.arrayWrapper) {
		const forwarded = new Proxy(['seed'], {
			get(values, name, receiver) {
				return name === '0' ? dynamicChild() : Reflect.get(values, name, receiver);
			},
		});
		const children = props.nestedArray ? [forwarded] : forwarded;
		first = createElement('li', { key: 'first', 'data-proxy-row': 'first' }, children);
	} else {
		const target = {
			...createElement('li', { key: 'first', 'data-proxy-row': 'first' }, 'seed'),
		};
		first = new Proxy(target, {
			get(descriptor, name, receiver) {
				return name === 'children' ? dynamicChild() : Reflect.get(descriptor, name, receiver);
			},
		});
	}
	const rows = [
		first,
		createElement('li', { key: 'tail', 'data-proxy-row': 'tail' }, 'Tail'),
	];
	<ul id="proxy-descriptor-list">{rows}</ul>
}
`;

const server = loadCompiledFixtureSource(FIXTURE, {
	id: 'descriptor-list-hydration.tsrx',
	mode: 'server',
});
const client = loadCompiledFixtureSource(FIXTURE, {
	id: 'descriptor-list-hydration.tsrx',
	mode: 'client',
});

afterEach(() => {
	document.querySelectorAll('[data-descriptor-list-test]').forEach((node) => node.remove());
});

describe('descriptor-authored keyed lists hydrate self-delimiting server hosts', () => {
	it.each([
		{ serverShape: 'compiled direct-host', source: server.NativeRows },
		{ serverShape: 'descriptor-authored', source: server.DescriptorRows },
	])(
		'adopts $serverShape rows, preserves uncontrolled edits and focus, and activates refs and events',
		({ source }) => {
			const items = [
				{ id: 'alpha', label: 'Alpha' },
				{ id: 'beta', label: 'Beta' },
			];
			const refs = {
				alpha: { current: null as Element | null },
				beta: { current: null as Element | null },
			};
			const onPick = vi.fn();
			const html = ServerRuntime.renderToString(source, {
				items,
				onPick: () => {},
				refs,
			}).html;
			const container = document.createElement('div');
			container.dataset.descriptorListTest = '';
			document.body.appendChild(container);
			container.innerHTML = html;
			const rows = [...container.querySelectorAll<HTMLLIElement>('li')];
			const betaInput = rows[1].querySelector('input') as HTMLInputElement;
			betaInput.value = 'typed before hydration';
			betaInput.focus();

			const root = hydrateRoot(container, client.DescriptorRows, { items, onPick, refs });
			try {
				flushSync(() => {});
				expect([...container.querySelectorAll('li')]).toEqual(rows);
				expect(container.querySelector('[data-input="beta"]')).toBe(betaInput);
				expect(betaInput.value).toBe('typed before hydration');
				expect(document.activeElement).toBe(betaInput);
				expect(refs.alpha.current).toBe(rows[0]);
				expect(refs.beta.current).toBe(rows[1]);

				flushSync(() => rows[1].querySelector<HTMLButtonElement>('button')!.click());
				expect(onPick).toHaveBeenCalledExactlyOnceWith('beta');

				flushSync(() =>
					root.render(client.DescriptorRows, {
						items: [items[1], items[0]],
						onPick,
						refs,
					}),
				);
				expect([...container.querySelectorAll('li')]).toEqual([rows[1], rows[0]]);
				expect(betaInput.value).toBe('typed before hydration');

				const betaButton = rows[1].querySelector('button')!;
				const betaText = betaButton.firstChild;
				for (const label of ['Beta streamed', 'Beta streamed again']) {
					flushSync(() =>
						root.render(client.DescriptorRows, {
							items: [{ ...items[1], label }, items[0]],
							onPick,
							refs,
						}),
					);
					expect(rows[1].querySelector('button')).toBe(betaButton);
					expect(betaButton.firstChild).toBe(betaText);
					expect(betaButton.textContent).toBe(label);
					expect(betaInput.value).toBe('typed before hydration');
				}
			} finally {
				root.unmount();
			}
		},
	);

	it('adopts mixed host, stateful component, nested, fragment, text, and empty items', () => {
		const items = [
			{ id: 'alpha', kind: 'host', label: 'Alpha' },
			{ id: 'beta', kind: 'component', label: 'Beta' },
			{ id: 'empty', kind: 'empty', label: '' },
			{ id: 'text', kind: 'text', label: 'standalone text' },
			{ id: 'nested', kind: 'nested', label: 'Nested' },
			{ id: 'fragment', kind: 'fragment', label: 'Fragment' },
			{ id: 'omega', kind: 'host', label: 'Omega' },
		];
		const container = document.createElement('div');
		container.dataset.descriptorListTest = '';
		document.body.appendChild(container);
		container.innerHTML = ServerRuntime.renderToString(server.MixedDescriptorRows, { items }).html;
		const rows = new Map(
			[...container.querySelectorAll<HTMLLIElement>('li[data-id]')].map((row) => [
				row.dataset.id,
				row,
			]),
		);

		const root = hydrateRoot(container, client.MixedDescriptorRows, { items });
		try {
			flushSync(() => {});
			expect(container.querySelector('#mixed-descriptor-list')?.textContent).toContain(
				'standalone text',
			);
			expect([...container.querySelectorAll('li[data-id]')]).toEqual([...rows.values()]);

			const beta = rows.get('beta')!;
			const nested = rows.get('nested')!;
			flushSync(() => beta.querySelector<HTMLButtonElement>('button')!.click());
			flushSync(() => nested.querySelector<HTMLButtonElement>('button')!.click());
			expect(beta.textContent).toBe('Beta:1');
			expect(nested.textContent).toBe('Nested:1');

			const reordered = [items[4], items[6], items[0], items[1], items[5]];
			flushSync(() => root.render(client.MixedDescriptorRows, { items: reordered }));
			expect([...container.querySelectorAll('li[data-id]')]).toEqual(
				reordered.map((item) => rows.get(item.id)),
			);
			expect(beta.textContent).toBe('Beta:1');
			expect(nested.textContent).toBe('Nested:1');
			expect(container.querySelector('#mixed-descriptor-list')?.textContent).not.toContain(
				'standalone text',
			);

			const upgraded = reordered.map((item) =>
				item.id === 'alpha' ? { ...item, kind: 'nested' } : item,
			);
			flushSync(() => root.render(client.MixedDescriptorRows, { items: upgraded }));
			expect(container.querySelector('[data-id="alpha"]')).toBe(rows.get('alpha'));
			expect(container.querySelector('[data-counter="alpha"]')?.textContent).toBe('Alpha:0');
			expect(beta.textContent).toBe('Beta:1');
			expect(nested.textContent).toBe('Nested:1');

			flushSync(() => root.render(client.MixedDescriptorRows, { items: reordered }));
			expect(container.querySelector('[data-id="alpha"]')?.textContent).toBe('Alpha');
			expect(beta.textContent).toBe('Beta:1');
		} finally {
			root.unmount();
		}
	});

	it('continues adopting older server markup with an explicit range around each host', () => {
		const items = [
			{ id: 'first', label: 'First' },
			{ id: 'second', label: 'Second' },
		];
		const refs = {
			first: { current: null as Element | null },
			second: { current: null as Element | null },
		};
		const onPick = vi.fn();
		const container = document.createElement('div');
		container.dataset.descriptorListTest = '';
		document.body.appendChild(container);
		container.innerHTML = ServerRuntime.renderToString(server.NativeRows, {
			items,
			refs,
			onPick: () => {},
		}).html;
		const rows = [...container.querySelectorAll<HTMLLIElement>('li')];
		for (const row of rows) {
			row.parentNode!.insertBefore(document.createComment('['), row);
			row.parentNode!.insertBefore(document.createComment(']'), row.nextSibling);
		}

		const root = hydrateRoot(container, client.DescriptorRows, { items, refs, onPick });
		try {
			flushSync(() => {});
			expect([...container.querySelectorAll('li')]).toEqual(rows);
			expect(refs.first.current).toBe(rows[0]);
			expect(refs.second.current).toBe(rows[1]);
			flushSync(() => rows[1].querySelector<HTMLButtonElement>('button')!.click());
			expect(onPick).toHaveBeenCalledExactlyOnceWith('second');
		} finally {
			root.unmount();
		}
	});

	it('preserves SVG, MathML, and foreignObject node namespaces and identity', () => {
		const items = [
			{ id: 'graphic', kind: 'svg', label: 'Graphic' },
			{ id: 'foreign', kind: 'foreign', label: 'Foreign' },
		];
		const container = document.createElement('div');
		container.dataset.descriptorListTest = '';
		document.body.appendChild(container);
		container.innerHTML = ServerRuntime.renderToString(server.NamespaceDescriptorRows, {
			items,
		}).html;
		const svgRows = [...container.querySelectorAll<Element>('[data-svg-row]')];
		const mathRows = [...container.querySelectorAll<Element>('[data-math-row]')];
		const svgLabel = container.querySelector('[data-svg-label="graphic"]')!;
		const foreignLabel = container.querySelector('[data-svg-label="foreign"]')!;

		const root = hydrateRoot(container, client.NamespaceDescriptorRows, { items });
		try {
			flushSync(() => {});
			expect([...container.querySelectorAll('[data-svg-row]')]).toEqual(svgRows);
			expect([...container.querySelectorAll('[data-math-row]')]).toEqual(mathRows);
			expect(svgRows.map((row) => row.namespaceURI)).toEqual([
				'http://www.w3.org/2000/svg',
				'http://www.w3.org/2000/svg',
			]);
			expect(mathRows.map((row) => row.namespaceURI)).toEqual([
				'http://www.w3.org/1998/Math/MathML',
				'http://www.w3.org/1998/Math/MathML',
			]);
			expect(container.querySelector('[data-svg-label="graphic"]')).toBe(svgLabel);
			expect(svgLabel.namespaceURI).toBe('http://www.w3.org/2000/svg');
			expect(container.querySelector('[data-svg-label="foreign"]')).toBe(foreignLabel);
			expect(foreignLabel.namespaceURI).toBe('http://www.w3.org/1999/xhtml');

			const reordered = [items[1], items[0]];
			flushSync(() => root.render(client.NamespaceDescriptorRows, { items: reordered }));
			expect([...container.querySelectorAll('[data-svg-row]')]).toEqual([svgRows[1], svgRows[0]]);
			expect([...container.querySelectorAll('[data-math-row]')]).toEqual([
				mathRows[1],
				mathRows[0],
			]);
		} finally {
			root.unmount();
		}
	});

	it.each([
		{ childShape: 'component descriptor', renderFunction: false },
		{ childShape: 'render function', renderFunction: true },
		{
			childShape: 'component descriptor from an array forwarding wrapper',
			renderFunction: false,
			arrayWrapper: true,
		},
		{
			childShape: 'render function from an array forwarding wrapper',
			renderFunction: true,
			arrayWrapper: true,
		},
		{
			childShape: 'component descriptor from a nested array forwarding wrapper',
			renderFunction: false,
			arrayWrapper: true,
			nestedArray: true,
		},
		{
			childShape: 'render function from a nested array forwarding wrapper',
			renderFunction: true,
			arrayWrapper: true,
			nestedArray: true,
		},
	])('preserves a Proxy-provided $childShape without duplicating keyed siblings', (shape) => {
		const props = { label: 'dynamic child', ...shape };
		const container = document.createElement('div');
		container.dataset.descriptorListTest = '';
		document.body.appendChild(container);
		container.innerHTML = ServerRuntime.renderToString(server.ProxyDescriptorRows, props).html;
		const rows = [...container.querySelectorAll<HTMLLIElement>('[data-proxy-row]')];
		const nested = container.querySelector('[data-proxy-inner]');

		const root = hydrateRoot(container, client.ProxyDescriptorRows, props);
		try {
			flushSync(() => {});
			expect([...container.querySelectorAll('[data-proxy-row]')]).toEqual(rows);
			expect(container.querySelector('[data-proxy-inner]')).toBe(nested);
			expect(nested?.textContent).toBe('dynamic child');
		} finally {
			root.unmount();
		}
	});
});

describe('descriptor list serialization preserves observable child evaluation', () => {
	it('reads an accessor-backed host descriptor child only once', () => {
		let reads = 0;
		const first = {
			...ServerRuntime.createElement('li', { key: 'first' }, 'seed'),
			get children() {
				reads++;
				return 'value-' + reads;
			},
		};
		const second = ServerRuntime.createElement('li', { key: 'second' }, 'tail');

		const { html } = ServerRuntime.renderToString(() => [first, second]);

		expect(html).toContain('<li>value-1</li>');
		expect(reads).toBe(1);
	});

	it('does not inspect an indexed child accessor before its established serializer reads', () => {
		let reads = 0;
		const children: unknown[] = ['seed'];
		Object.defineProperty(children, '0', {
			configurable: true,
			enumerable: true,
			get() {
				reads++;
				return 'value-' + reads;
			},
		});
		const first = ServerRuntime.createElement('li', { key: 'first' }, children);
		const second = ServerRuntime.createElement('li', { key: 'second' }, 'tail');

		const { html } = ServerRuntime.renderToString(() => [first, second]);

		expect(html).toContain('<li>value-2</li>');
		expect(reads).toBe(2);
	});

	it('materializes iterable descriptor children without probing their iterator twice', () => {
		let reads = 0;
		const children = {
			get [Symbol.iterator]() {
				reads++;
				return function* () {
					yield ServerRuntime.createElement('span', null, 'iterated');
				};
			},
		};
		const first = ServerRuntime.createElement('li', { key: 'first' }, children);
		const second = ServerRuntime.createElement('li', { key: 'second' }, 'tail');

		const { html } = ServerRuntime.renderToString(() => [first, second]);

		expect(html).toContain('<li>');
		expect(html).toContain('<span>iterated</span>');
		expect(reads).toBe(1);
	});

	it('reads Proxy-provided descriptor children once and keeps their observed value', () => {
		let reads = 0;
		const target = { ...ServerRuntime.createElement('li', { key: 'first' }, 'seed') };
		const first = new Proxy(target, {
			get(descriptor, name, receiver) {
				if (name === 'children') {
					reads++;
					return 'value-' + reads;
				}
				return Reflect.get(descriptor, name, receiver);
			},
		});
		const second = ServerRuntime.createElement('li', { key: 'second' }, 'tail');

		const { html } = ServerRuntime.renderToString(() => [first, second]);

		expect(html).toContain('<li>value-1</li>');
		expect(reads).toBe(1);
	});

	it('keeps serializing opaque Proxy descriptors whose reflection trap throws', () => {
		const target = { ...ServerRuntime.createElement('li', { key: 'first' }, 'opaque') };
		const first = new Proxy(target, {
			getOwnPropertyDescriptor(descriptor, name) {
				if (name === 'children') throw new Error('private descriptor metadata');
				return Reflect.getOwnPropertyDescriptor(descriptor, name);
			},
		});
		const second = ServerRuntime.createElement('li', { key: 'second' }, 'tail');

		const { html } = ServerRuntime.renderToString(() => [first, second]);

		expect(html).toContain('<li>opaque</li>');
		expect(html).toContain('<li>tail</li>');
	});
});
