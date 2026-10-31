import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { renderToString } from 'octane/server';
import { mount, type MountResult } from './_helpers.js';
import { loadCompiledFixtureSource } from './_server-fixture.js';

// JSX anywhere inside a spread attribute is an ordinary element value, exactly
// as it is in a named attribute: `{...{ render: (n) => <Label n={n} /> }}` must
// reach the component as the same render prop `render={(n) => <Label n={n} />}`
// would. `compiler/spread-attribute-jsx-values.test.ts` checks that bundlers
// can parse the compiled module.

const FILE = 'spread-attribute-jsx-values.tsrx';
const source = readFileSync(`packages/octane/tests/_fixtures/${FILE}`, 'utf8');
const dev = process.env.OCTANE_TEST_COMPILE_MODE !== 'prod';
const load = (mode: 'client' | 'server') =>
	loadCompiledFixtureSource(source, { id: FILE, mode, compileOptions: { dev, hmr: false } });

describe(`JSX values in spread attributes (${dev ? 'dev' : 'prod'})`, () => {
	let mounted: MountResult | null = null;
	afterEach(() => {
		mounted?.unmount();
		mounted = null;
	});

	it('renders the element a component spread passes as a render prop', () => {
		mounted = mount(load('client').ComponentSpread);
		expect(mounted.find('div > b').textContent).toBe('1');
		expect(renderToString(load('server').ComponentSpread).html).toContain('<b>1</b>');
	});

	it('renders the element a conditional spread object passes only while it applies', () => {
		const client = load('client');
		mounted = mount(client.ConditionalSpread, { cond: true });
		expect(mounted.find('div > b').textContent).toBe('1');
		mounted.update(client.ConditionalSpread, { cond: false });
		expect(mounted.find('div').innerHTML).toBe('');
		const server = load('server');
		expect(renderToString(server.ConditionalSpread, { cond: true }).html).toContain('<b>1</b>');
		expect(renderToString(server.ConditionalSpread, { cond: false }).html).not.toContain('<b>');
	});

	it('renders the element a handler from a host spread builds', () => {
		mounted = mount(load('client').HostSpread);
		expect(mounted.container.querySelector('b')).toBeNull();
		mounted.click('button');
		expect(mounted.find('b').textContent).toBe('2');
	});
});
