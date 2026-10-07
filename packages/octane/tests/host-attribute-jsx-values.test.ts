import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { renderToString } from 'octane/server';
import { createRoot, flushSync } from '../src/index.js';
import { mount, type MountResult } from './_helpers.js';
import { loadCompiledFixtureSource } from './_server-fixture.js';

// JSX inside a host attribute's expression is an ordinary element value, so
// `onClick={() => root.render(<Toast />)}` builds the same descriptor it would
// anywhere else. Each fixture renders the element its handler built, which is
// only possible when the compiled module parses and the descriptor is real.

const FILE = 'host-attribute-jsx-values.tsrx';
const source = readFileSync(`packages/octane/tests/_fixtures/${FILE}`, 'utf8');
const dev = process.env.OCTANE_TEST_COMPILE_MODE !== 'prod';
// `hmr: false` keeps the production handler lowering reachable in both modes.
const client = loadCompiledFixtureSource(source, {
	id: FILE,
	mode: 'client',
	compileOptions: { dev, hmr: false },
});
const server = loadCompiledFixtureSource(source, {
	id: FILE,
	mode: 'server',
	compileOptions: { dev, hmr: false },
});

describe(`JSX values in host attributes (${dev ? 'dev' : 'prod'})`, () => {
	let mounted: MountResult | null = null;
	afterEach(() => {
		mounted?.unmount();
		mounted = null;
	});

	it('renders an element an inline handler passes to another root', () => {
		const target = document.createElement('div');
		document.body.appendChild(target);
		const root = createRoot(target);
		try {
			mounted = mount(client.RenderIntoRoot, { root, label: 'toast' });
			expect(target.querySelector('output')).toBeNull();
			mounted.click('button');
			flushSync(() => {});
			expect(target.querySelector('output')?.textContent).toBe('toast');
		} finally {
			root.unmount();
			target.remove();
		}
	});

	it.each([
		['an inline handler', 'InlineIntrinsic', 'b', 'bold'],
		['a handler-only setup local', 'LocalHandler', 'output', 'local'],
		['a statement-bodied handler', 'BlockHandler', 'output', 'first'],
		['a statement-bodied handler with a directive', 'BlockHandlerDirective', 'p > output', 'first'],
	])('renders the element %s builds', (_label, name, selector, text) => {
		mounted = mount(client[name], { label: 'first' });
		expect(mounted.container.querySelector(selector)).toBeNull();
		mounted.click('button');
		expect(mounted.find(selector).textContent).toBe(text);
	});

	it('reads the latest captures when a statement-bodied handler builds an element', () => {
		mounted = mount(client.BlockHandlerDirective, { label: 'first' });
		mounted.update(client.BlockHandlerDirective, { label: 'second' });
		mounted.click('button');
		expect(mounted.find('p > output').textContent).toBe('second');
		mounted.update(client.BlockHandlerDirective, { label: '' });
		mounted.click('button');
		expect(mounted.find('p').textContent).toBe('');
	});

	it('serializes an attribute computed from an element on the client and the server', () => {
		mounted = mount(client.AttributeValue);
		expect(mounted.find('p').getAttribute('title')).toBe('element');
		expect(renderToString(server.AttributeValue).html).toContain('title="element"');
	});
});
