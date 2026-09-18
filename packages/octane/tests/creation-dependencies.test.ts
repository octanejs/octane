import { describe, expect, it } from 'vitest';
import { prerender } from 'octane/static';
import { act, mount } from './_helpers.js';
import { loadCompiledFixtureSource } from './_server-fixture.js';

const cases = [
	{ name: 'erased assertion', expression: 'props.load(props.id as UserId)' },
	{ name: 'erased type argument', expression: 'props.load<UserId>(props.id)' },
	{ name: 'erased satisfies clause', expression: 'props.load(props.id satisfies UserId)' },
	{
		name: 'guarded absent identifier',
		expression: "props.load(typeof creationAbsentGlobal === 'undefined' ? props.id : 'unexpected')",
	},
	{
		name: 'callback local',
		expression: 'props.load(() => { const local = props.id; return local; })',
	},
	{
		name: 'catch binding',
		expression: 'props.load(() => { try { throw props.id; } catch (err) { return err; } })',
	},
	{
		name: 'loop binding and label',
		expression:
			'props.load(() => { outer: for (const item of [props.id]) { if (item) break outer; } return props.id; })',
	},
	{
		name: 'class binding and method key',
		expression:
			'props.load(() => { const Worker = class { read() { return props.id; } }; return new Worker().read(); })',
	},
	{
		name: 'named callback binding',
		expression:
			'props.load(function creationCallback() { return creationCallback.name && props.id; })',
	},
	{
		name: 'parameter default and computed pattern key',
		expression: 'props.load(({ [props.key]: value = props.id } = {}) => value)',
	},
	{
		name: 'outer value beside a shadowed callback binding',
		expression: "props.load((() => { const props = { id: '' }; return props.id; })() + props.id)",
	},
	{
		name: 'hoisted callback binding',
		expression: 'props.load(() => { local = props.id; return local; var local; })',
	},
];

function sourceFor(expression: string, ext: string, site: string) {
	const reader =
		ext === 'tsrx'
			? 'function Reader(props) @{ const value = use(props.request); <p>{value as string}</p> }'
			: 'function Reader(props) { const value = use(props.request); return <p>{value as string}</p>; }';
	const body =
		site === 'argument'
			? `const value = use(${expression}); ${ext === 'tsrx' ? '' : 'return '}<p>{value as string}</p>${ext === 'tsrx' ? '' : ';'}`
			: `${ext === 'tsrx' ? '' : 'return '}<Reader request={${expression}} />${ext === 'tsrx' ? '' : ';'}`;
	return `import { use } from 'octane';
type UserId = string;
${reader}
export function Page(props) ${ext === 'tsrx' ? '@' : ''}{ ${body} }`;
}

function requestLoader() {
	const requests = new Map<unknown, Promise<unknown>>();
	return (argument: unknown) => {
		const value = typeof argument === 'function' ? argument() : argument;
		let request = requests.get(value);
		if (request === undefined) {
			request = Promise.resolve(value);
			requests.set(value, request);
		}
		return request;
	};
}

async function renderedText(source: string, ext: string, mode: 'client' | 'server', dev: boolean) {
	const { Page } = loadCompiledFixtureSource(source, {
		id: `/project/CreationDependencies.${ext}`,
		mode,
		compileOptions: { hmr: false, dev },
	});
	const load = requestLoader();
	const props = { id: 'first', key: 'label', load };
	if (mode === 'server') {
		expect((await prerender(Page, props)).html).toContain('<p>first</p>');
		expect((await prerender(Page, { ...props, id: 'second' })).html).toContain('<p>second</p>');
		return;
	}
	const rendered = mount(Page, props);
	try {
		await act(async () => {});
		expect(rendered.find('p').textContent).toBe('first');
		await act(() => rendered.update(Page, { ...props }));
		expect(rendered.find('p').textContent).toBe('first');
		await act(() => rendered.update(Page, { ...props, id: 'second' }));
		expect(rendered.find('p').textContent).toBe('second');
	} finally {
		rendered.unmount();
	}
}

describe('async creation dependencies', () => {
	it.each(
		[false, true].flatMap((dev) =>
			(['client', 'server'] as const).flatMap((mode) =>
				['tsrx', 'tsx'].flatMap((ext) =>
					(mode === 'server' ? ['argument', 'prop'] : ['argument']).flatMap((site) =>
						cases.map((entry) => ({ ...entry, dev, mode, ext, site })),
					),
				),
			),
		),
	)('renders $name in a $site creation ($mode, $ext, dev=$dev)', async (entry) => {
		await renderedText(
			sourceFor(entry.expression, entry.ext, entry.site),
			entry.ext,
			entry.mode,
			entry.dev,
		);
	});

	it.each([false, true].flatMap((dev) => ['tsrx', 'tsx'].map((ext) => ({ dev, ext }))))(
		'refreshes a guarded global when its type changes ($ext, dev=$dev)',
		async ({ dev, ext }) => {
			const globals = globalThis as Record<string, unknown>;
			const { Page } = loadCompiledFixtureSource(
				sourceFor('props.load(typeof creationOptionalGlobal)', ext, 'argument'),
				{
					id: `/project/OptionalCreationDependency.${ext}`,
					mode: 'client',
					compileOptions: { hmr: false, dev },
				},
			);
			const props = { load: requestLoader() };
			const rendered = mount(Page, props);
			try {
				await act(async () => {});
				expect(rendered.find('p').textContent).toBe('undefined');
				globals.creationOptionalGlobal = () => {};
				await act(() => rendered.update(Page, props));
				expect(rendered.find('p').textContent).toBe('function');
			} finally {
				rendered.unmount();
				delete globals.creationOptionalGlobal;
			}
		},
	);

	it.each([false, true].flatMap((dev) => ['tsrx', 'tsx'].map((ext) => ({ dev, ext }))))(
		'refreshes a request when its constructor changes ($ext, dev=$dev)',
		async ({ dev, ext }) => {
			const { Page } = loadCompiledFixtureSource(
				sourceFor('new props.Request(props.id)', ext, 'argument'),
				{
					id: `/project/ConstructorCreationDependency.${ext}`,
					mode: 'client',
					compileOptions: { hmr: false, dev },
				},
			);
			const load = requestLoader();
			const request = (label: string) =>
				function (id: string) {
					return load(`${label}:${id}`);
				};
			const props = { id: 'same', Request: request('first') };
			const rendered = mount(Page, props);
			try {
				await act(async () => {});
				expect(rendered.find('p').textContent).toBe('first:same');
				await act(() => rendered.update(Page, { ...props, Request: request('second') }));
				expect(rendered.find('p').textContent).toBe('second:same');
			} finally {
				rendered.unmount();
			}
		},
	);
});
