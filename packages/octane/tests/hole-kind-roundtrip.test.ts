import { describe, it, expect, vi } from 'vitest';
import { createElement, flushSync, hydrateRoot, type OctaneNode, type Root } from '../src/index.js';
import * as ServerRuntime from 'octane/server';
import { mount } from './_helpers.js';
import { loadServerFixture } from './_server-fixture.js';
import {
	HoleKindRoundTrip,
	ArrayNullRoundTrip,
	ArrayComponentRoundTrip,
	ArrayHostRoundTrip,
	OnlyValue,
	SiblingValue,
	OnlyStringValue,
	SiblingStringValue,
	OnlyTypedValue,
	SiblingTypedValue,
	StatefulValue,
} from './_fixtures/hole-kind-flip.tsrx';

// A sole-child value hole may change kind on any render. Leaving the keyed
// array regime and re-entering it later must keep working — repeatedly — and
// the intermediate kind must render correctly too.
describe('value hole kind round-trip', () => {
	it('survives array -> text -> array on a sole-child hole', () => {
		const r = mount(HoleKindRoundTrip);
		expect(r.findAll('#host i').map((el) => el.textContent)).toEqual(['a', 'b']);
		r.click('#next');
		expect(r.find('#host').textContent).toBe('plain');
		expect(r.findAll('#host i')).toEqual([]);
		r.click('#next');
		expect(r.findAll('#host i').map((el) => el.textContent)).toEqual(['a', 'b']);
		// A second full cycle proves the re-entered array mode is itself sound.
		r.click('#next');
		expect(r.find('#host').textContent).toBe('plain');
		r.click('#next');
		expect(r.findAll('#host i').map((el) => el.textContent)).toEqual(['a', 'b']);
		r.unmount();
	});

	it('survives array -> null -> array on a sole-child hole', () => {
		const r = mount(ArrayNullRoundTrip);
		expect(r.findAll('#host i').map((el) => el.textContent)).toEqual(['a', 'b']);
		r.click('#next');
		expect(r.find('#host').textContent).toBe('');
		r.click('#next');
		expect(r.findAll('#host i').map((el) => el.textContent)).toEqual(['a', 'b']);
		r.click('#next');
		expect(r.find('#host').textContent).toBe('');
		r.click('#next');
		expect(r.findAll('#host i').map((el) => el.textContent)).toEqual(['a', 'b']);
		r.unmount();
	});

	it('survives array -> component -> array on a sole-child hole', () => {
		const r = mount(ArrayComponentRoundTrip);
		expect(r.findAll('#host i').map((el) => el.textContent)).toEqual(['a', 'b']);
		r.click('#next');
		expect(r.find('#host').textContent).toBe('chip');
		r.click('#next');
		expect(r.findAll('#host i').map((el) => el.textContent)).toEqual(['a', 'b']);
		r.click('#next');
		expect(r.find('#host').textContent).toBe('chip');
		r.click('#next');
		expect(r.findAll('#host i').map((el) => el.textContent)).toEqual(['a', 'b']);
		r.unmount();
	});

	it('survives array -> pure host -> array on a sole-child hole', () => {
		const r = mount(ArrayHostRoundTrip);
		expect(r.findAll('#host i').map((el) => el.textContent)).toEqual(['a', 'b']);
		r.click('#next');
		expect(r.find('#host').textContent).toBe('solo');
		expect(r.find('#host em').textContent).toBe('solo');
		r.click('#next');
		expect(r.findAll('#host i').map((el) => el.textContent)).toEqual(['a', 'b']);
		r.click('#next');
		expect(r.find('#host em').textContent).toBe('solo');
		r.click('#next');
		expect(r.findAll('#host i').map((el) => el.textContent)).toEqual(['a', 'b']);
		r.unmount();
	});
});

const primitiveValues: { value: OctaneNode; text: string }[] = [
	{ value: true, text: '' },
	{ value: 'x', text: 'x' },
	{ value: true, text: '' },
	{ value: 'y', text: 'y' },
	{ value: false, text: '' },
	{ value: 0, text: '0' },
	{ value: true, text: '' },
	{ value: 7, text: '7' },
	{ value: null, text: '' },
	{ value: 'z', text: 'z' },
	{ value: undefined, text: '' },
	{ value: '', text: '' },
	{ value: false, text: '' },
	{ value: 'last', text: 'last' },
];

const server = loadServerFixture('packages/octane/tests/_fixtures/hole-kind-flip.tsrx', {
	compileOptions: {
		hmr: false,
		dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod',
	},
});

const layouts = [
	{
		name: 'only child',
		Body: OnlyValue,
		StringBody: OnlyStringValue,
		TypedBody: OnlyTypedValue,
		ServerBody: server.OnlyValue,
		ServerStringBody: server.OnlyStringValue,
		ServerTypedBody: server.OnlyTypedValue,
		prefix: '',
		suffix: '',
	},
	{
		name: 'between siblings',
		Body: SiblingValue,
		StringBody: SiblingStringValue,
		TypedBody: SiblingTypedValue,
		ServerBody: server.SiblingValue,
		ServerStringBody: server.SiblingStringValue,
		ServerTypedBody: server.SiblingTypedValue,
		prefix: 'before|',
		suffix: '|after',
	},
];

function serverHostText(html: string): string | null {
	const container = document.createElement('div');
	container.innerHTML = html;
	return container.querySelector('#value-host')!.textContent;
}

describe.each(layouts)('renderable values as $name', (layout) => {
	const {
		Body,
		StringBody,
		TypedBody,
		ServerBody,
		ServerStringBody,
		ServerTypedBody,
		prefix,
		suffix,
	} = layout;
	const text = (value: string) => prefix + value + suffix;

	it('keeps booleans and nullish values empty after string and number updates', () => {
		const r = mount(Body, { value: primitiveValues[0].value });
		const host = r.find('#value-host');
		const siblings = [...host.children];
		const observations = [host.textContent];
		try {
			for (const { value } of primitiveValues.slice(1)) {
				r.update(Body, { value });
				expect(r.find('#value-host')).toBe(host);
				for (const sibling of siblings) expect(sibling.parentNode).toBe(host);
				observations.push(host.textContent);
			}
			expect(observations).toEqual(primitiveValues.map((sample) => text(sample.text)));
		} finally {
			r.unmount();
		}
	});

	it.each([
		{
			name: 'explicit String conversion',
			Client: StringBody,
			Server: ServerStringBody,
			convert: (value: OctaneNode) => String(value),
		},
		{
			name: 'an explicit string assertion',
			Client: TypedBody,
			Server: ServerTypedBody,
			convert: (value: OctaneNode) => (value == null || value === false ? '' : String(value)),
		},
	])('preserves $name on the client and server', async ({ Client, Server, convert }) => {
		const r = mount(Client, { value: primitiveValues[0].value });
		const clientText: (string | null)[] = [];
		const serverText: (string | null)[] = [];
		try {
			for (const { value } of primitiveValues) {
				r.update(Client, { value });
				clientText.push(r.find('#value-host').textContent);
				const { html } = await ServerRuntime.renderToString(Server, { value });
				serverText.push(serverHostText(html));
			}
			const expected = primitiveValues.map(({ value }) => text(convert(value)));
			expect(clientText).toEqual(expected);
			expect(serverText).toEqual(expected);
		} finally {
			r.unmount();
		}
	});

	it('uses the same primitive-child semantics when server-rendering', async () => {
		const observations: (string | null)[] = [];
		for (const { value } of primitiveValues) {
			const { html } = await ServerRuntime.renderToString(ServerBody, { value });
			observations.push(serverHostText(html));
		}
		expect(observations).toEqual(primitiveValues.map((sample) => text(sample.text)));
	});

	it.each([
		{ value: true, initialText: '' },
		{ value: 'server', initialText: 'server' },
		{ value: 0, initialText: '0' },
		{ value: null, initialText: '' },
	])('adopts server value $value and stays consistent through updates', async (initial) => {
		const { html } = await ServerRuntime.renderToString(ServerBody, { value: initial.value });
		const container = document.createElement('div');
		container.innerHTML = html;
		document.body.appendChild(container);
		const host = container.querySelector('#value-host')!;
		const siblings = [...host.children];
		const serverText = initial.initialText
			? [...host.childNodes].find(
					(node) => node.nodeType === Node.TEXT_NODE && node.nodeValue === initial.initialText,
				)
			: undefined;
		expect(host.textContent).toBe(text(initial.initialText));
		if (initial.initialText) expect(serverText).toBeDefined();
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		let root: Root | undefined;
		try {
			root = hydrateRoot(container, Body, { value: initial.value });
			flushSync(() => {});
			expect(container.querySelector('#value-host')).toBe(host);
			for (const sibling of siblings) expect(sibling.parentNode).toBe(host);
			if (serverText) expect(serverText.parentNode).toBe(host);
			const observations: (string | null)[] = [];
			for (const { value } of primitiveValues) {
				flushSync(() => root!.render(Body, { value }));
				expect(container.querySelector('#value-host')).toBe(host);
				for (const sibling of siblings) expect(sibling.parentNode).toBe(host);
				observations.push(host.textContent);
			}
			expect(observations).toEqual(primitiveValues.map((sample) => text(sample.text)));
			expect(error.mock.calls.flat().map(String).join('\n')).not.toMatch(/hydration.*mismatch/i);
		} finally {
			root?.unmount();
			error.mockRestore();
			container.remove();
		}
	});

	it('preserves keyed child state and cleans up children when their value becomes empty', () => {
		const events: string[] = [];
		const log = (entry: string) => events.push(entry);
		const child = (id: string) => createElement(StatefulValue, { key: id, id, log });
		const r = mount(Body, { value: [child('a'), child('b')] });
		const host = r.find('#value-host');
		const siblings = [...host.querySelectorAll('[data-static]')];
		const a = r.find('[data-child="a"]');
		const b = r.find('[data-child="b"]');
		try {
			expect(events).toEqual(['mount a', 'mount b']);
			r.click('[data-child="a"]');
			r.update(Body, { value: [child('b'), child('a')] });
			expect(r.findAll('[data-child]')).toEqual([b, a]);
			expect(r.find('[data-child="a"]')).toBe(a);
			expect(r.find('[data-child="b"]')).toBe(b);
			expect(a.textContent).toBe('a:1');
			expect(events).toEqual(['mount a', 'mount b']);

			r.update(Body, { value: true });
			expect(host.textContent).toBe(text(''));
			expect(a.isConnected).toBe(false);
			expect(b.isConnected).toBe(false);
			expect(events.slice(2).sort()).toEqual(['unmount a', 'unmount b']);

			r.update(Body, { value: child('c') });
			const c = r.find('[data-child="c"]');
			expect(c.textContent).toBe('c:0');
			r.update(Body, { value: 'again' });
			expect(c.isConnected).toBe(false);
			expect(events.slice(4)).toEqual(['mount c', 'unmount c']);
			r.update(Body, { value: false });
			expect(host.textContent).toBe(text(''));
			r.update(Body, { value: 0 });
			expect(host.textContent).toBe(text('0'));
			r.update(Body, { value: null });
			expect(host.textContent).toBe(text(''));
			expect(r.find('#value-host')).toBe(host);
			for (const sibling of siblings) expect(sibling.parentNode).toBe(host);
		} finally {
			r.unmount();
		}
		expect(events.filter((event) => event.startsWith('unmount ')).sort()).toEqual([
			'unmount a',
			'unmount b',
			'unmount c',
		]);
	});
});
