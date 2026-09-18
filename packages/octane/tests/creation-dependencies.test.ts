import { describe, expect, it } from 'vitest';
import { hydrateRoot } from 'octane';
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
		name: 'guarded absent value',
		expression:
			"props.load(typeof creationAbsentGlobal !== 'undefined' ? creationAbsentGlobal : props.id)",
	},
	{
		name: 'guarded absent member',
		expression:
			"props.load(typeof creationAbsentGlobal !== 'undefined' ? creationAbsentGlobal.value : props.id)",
	},
	{
		name: 'guarded absent computed member',
		expression:
			"props.load(typeof creationAbsentGlobal !== 'undefined' ? creationAbsentGlobal['value'] : props.id)",
	},
	{
		name: 'guarded absent short-circuit member',
		expression:
			"props.load((typeof creationAbsentGlobal !== 'undefined' && creationAbsentGlobal.value) || props.id)",
	},
	{
		name: 'guarded absent alternate member',
		expression:
			"props.load(typeof creationAbsentGlobal === 'undefined' ? props.id : creationAbsentGlobal.value)",
	},
	{
		name: 'guarded absent callback member',
		expression:
			"props.load(() => typeof creationAbsentGlobal !== 'undefined' ? creationAbsentGlobal.value : props.id)",
	},
	{
		name: 'guarded absent callback branch',
		expression:
			"props.load(() => { if (typeof creationAbsentGlobal !== 'undefined') return creationAbsentGlobal.value; return props.id; })",
	},
	{
		name: 'guarded absent callback early return',
		expression:
			"props.load(() => { if (typeof creationAbsentGlobal === 'undefined') return props.id; return creationAbsentGlobal.value; })",
	},
	{
		name: 'guarded absent short-circuit alternate',
		expression:
			"props.load((typeof creationAbsentGlobal === 'undefined' || creationAbsentGlobal.value) && props.id)",
	},
	{
		name: 'guarded absent reversed typeof comparison',
		expression:
			"props.load('undefined' != typeof creationAbsentGlobal ? creationAbsentGlobal.value : props.id)",
	},
	{
		name: 'guarded absent negated typeof comparison',
		expression:
			"props.load(!(typeof creationAbsentGlobal == 'undefined') ? creationAbsentGlobal.value : props.id)",
	},
	{
		name: 'guarded absent compound typeof comparison',
		expression:
			"props.load(typeof creationAbsentGlobal === 'object' && typeof creationOtherAbsentGlobal !== 'undefined' ? creationAbsentGlobal.value : props.id)",
	},
	{
		name: 'guarded absent conditional readiness',
		expression:
			"props.load(typeof creationAbsentGlobal !== 'undefined' && creationAbsentGlobal.ready ? creationAbsentGlobal.value : props.id)",
	},
	{
		name: 'guarded absent logical readiness',
		expression:
			"props.load((typeof creationAbsentGlobal !== 'undefined' && creationAbsentGlobal.ready) && creationAbsentGlobal.value || props.id)",
	},
	{
		name: 'guarded absent early return readiness',
		expression:
			"props.load(() => { if (typeof creationAbsentGlobal === 'undefined' || !creationAbsentGlobal.ready) return props.id; return creationAbsentGlobal.value; })",
	},
	{
		name: 'guarded absent negated readiness',
		expression:
			"props.load(!(typeof creationAbsentGlobal === 'undefined' || !creationAbsentGlobal.ready) ? creationAbsentGlobal.value : props.id)",
	},
	{
		name: 'guarded absent right-hand typeof readiness',
		expression:
			"props.load(props.ready && typeof creationAbsentGlobal !== 'undefined' ? creationAbsentGlobal.value : props.id)",
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

	it.each(
		[false, true].flatMap((dev) =>
			(['client', 'server'] as const).flatMap((mode) =>
				['tsrx', 'tsx'].flatMap((ext) =>
					(mode === 'server' ? ['argument', 'prop'] : ['argument']).flatMap((site) =>
						[false, true].map((member) => ({ dev, mode, ext, site, member })),
					),
				),
			),
		),
	)(
		'refreshes guarded global values without a type change ($mode, $ext, $site, member=$member, dev=$dev)',
		async ({ dev, mode, ext, site, member }) => {
			const globals = globalThis as Record<string, unknown>;
			const expression = `props.load(typeof creationOptionalGlobal === 'undefined' ? props.id : creationOptionalGlobal${member ? '.value' : ''})`;
			const { Page } = loadCompiledFixtureSource(sourceFor(expression, ext, site), {
				id: `/project/PresentCreationDependency.${ext}`,
				mode,
				compileOptions: { hmr: false, dev },
			});
			const props = { id: 'fallback', load: requestLoader() };
			const rendered = mode === 'client' ? mount(Page, props) : null;
			async function expectValue(value: string) {
				if (rendered) {
					await act(() => rendered.update(Page, props));
					await act(async () => {});
					expect(rendered.find('p').textContent).toBe(value);
				} else {
					expect((await prerender(Page, props)).html).toContain(`<p>${value}</p>`);
				}
			}
			try {
				await expectValue('fallback');
				const item = { value: 'first' };
				globals.creationOptionalGlobal = member ? item : 'first';
				await expectValue('first');
				item.value = 'second';
				if (!member) globals.creationOptionalGlobal = 'second';
				await expectValue('second');
				globals.creationOptionalGlobal = member ? { value: 'replacement' } : 'replacement';
				await expectValue('replacement');
				delete globals.creationOptionalGlobal;
				await expectValue('fallback');
			} finally {
				rendered?.unmount();
				delete globals.creationOptionalGlobal;
			}
		},
	);

	it.each(
		[false, true].flatMap((dev) =>
			(['client', 'server'] as const).flatMap((mode) =>
				['tsrx', 'tsx'].flatMap((ext) =>
					(mode === 'server' ? ['argument', 'prop'] : ['argument']).map((site) => ({
						dev,
						mode,
						ext,
						site,
					})),
				),
			),
		),
	)(
		'keeps getters behind their typeof guard ($mode, $ext, $site, dev=$dev)',
		async ({ dev, mode, ext, site }) => {
			const globals = globalThis as Record<string, unknown>;
			globals.creationOptionalGlobal = {
				get value() {
					throw new Error('disabled global getter read');
				},
			};
			try {
				await renderedText(
					sourceFor(
						"props.load(typeof creationOptionalGlobal === 'function' ? creationOptionalGlobal.value : props.id)",
						ext,
						site,
					),
					ext,
					mode,
					dev,
				);
			} finally {
				delete globals.creationOptionalGlobal;
			}
		},
	);

	it.each(
		[false, true].flatMap((dev) =>
			(['client', 'server'] as const).flatMap((mode) =>
				['tsrx', 'tsx'].flatMap((ext) =>
					(mode === 'server' ? ['argument', 'prop'] : ['argument']).flatMap((site) =>
						[
							"props.load((typeof creationAbsentGlobal === 'undefined' ? props.id : creationAbsentGlobal.value) + creationAbsentGlobal.value)",
							"props.load(typeof creationAbsentGlobal !== 'undefined' ? creationAbsentGlobal.value : creationAbsentGlobal.value)",
							"props.load(typeof creationAbsentGlobal !== 'undefined' && props.ready ? props.id : creationAbsentGlobal.value)",
						].map((expression) => ({ dev, mode, ext, site, expression })),
					),
				),
			),
		),
	)(
		'preserves authored missing-global errors ($mode, $ext, $site, dev=$dev)',
		async ({ dev, mode, ext, site, expression }) => {
			const { Page } = loadCompiledFixtureSource(sourceFor(expression, ext, site), {
				id: `/project/UnguardedCreationDependency.${ext}`,
				mode,
				compileOptions: { hmr: false, dev },
			});
			const props = { id: 'fallback', load: requestLoader() };
			if (mode === 'server') {
				await expect(prerender(Page, props)).rejects.toThrow('creationAbsentGlobal is not defined');
			} else {
				expect(() => mount(Page, props)).toThrow('creationAbsentGlobal is not defined');
			}
		},
	);

	it.each([false, true].flatMap((dev) => ['tsrx', 'tsx'].map((ext) => ({ dev, ext }))))(
		'adopts a guarded global fallback and refreshes its value ($ext, dev=$dev)',
		async ({ dev, ext }) => {
			const globals = globalThis as Record<string, unknown>;
			const source = sourceFor(
				"props.load(typeof creationOptionalGlobal !== 'undefined' ? creationOptionalGlobal.value : props.id)",
				ext,
				'argument',
			);
			const options = {
				id: `/project/HydratedCreationDependency.${ext}`,
				compileOptions: { hmr: false, dev },
			};
			const server = loadCompiledFixtureSource(source, { ...options, mode: 'server' });
			const client = loadCompiledFixtureSource(source, { ...options, mode: 'client' });
			const props = { id: 'fallback', load: requestLoader() };
			const container = document.createElement('div');
			container.innerHTML = (await prerender(server.Page, props)).html;
			document.body.append(container);
			const paragraph = container.querySelector('p');
			const root = hydrateRoot(container, client.Page, props);
			try {
				await act(async () => {});
				expect(container.querySelector('p')).toBe(paragraph);
				expect(paragraph!.textContent).toBe('fallback');
				globals.creationOptionalGlobal = { value: 'present' };
				await act(() => root.render(client.Page, props));
				await act(async () => {});
				expect(container.querySelector('p')).toBe(paragraph);
				expect(paragraph!.textContent).toBe('present');
			} finally {
				root.unmount();
				container.remove();
				delete globals.creationOptionalGlobal;
			}
		},
	);

	it.each(
		[false, true].flatMap((dev) =>
			(['client', 'server'] as const).flatMap((mode) =>
				['tsrx', 'tsx'].flatMap((ext) =>
					[
						"props.load(typeof creationOptionalGlobal !== 'undefined' && creationCheckReadiness() ? creationOptionalGlobal.value : props.id)",
						"props.load((typeof creationOptionalGlobal !== 'undefined' && creationCheckReadiness()) && creationOptionalGlobal.value || props.id)",
						"props.load(!(typeof creationOptionalGlobal === 'undefined' || !creationCheckReadiness()) ? creationOptionalGlobal.value : props.id)",
						"props.load(() => { if (typeof creationOptionalGlobal === 'undefined' || !creationCheckReadiness()) return props.id; return creationOptionalGlobal.value; })",
					].flatMap((expression) =>
						[false, true].map((accessor) => ({
							dev,
							mode,
							ext,
							accessor,
							expression: accessor
								? expression.replace('creationCheckReadiness()', 'creationOptionalGlobal.ready')
								: expression,
						})),
					),
				),
			),
		),
	)(
		'leaves readiness predicates in the authored expression ($mode, $ext, accessor=$accessor, dev=$dev)',
		async ({ dev, mode, ext, expression, accessor }) => {
			const globals = globalThis as Record<string, unknown>;
			let ready = true;
			globals.creationOptionalGlobal = { value: 'present' };
			if (accessor) {
				let reads = 0;
				Object.defineProperty(globals.creationOptionalGlobal, 'ready', {
					// Existing value dependencies may probe a member. Repeating its
					// entire predicate adds observable reads before authored code.
					get: () => ++reads <= 2,
				});
			} else {
				globals.creationCheckReadiness = () => {
					const value = ready;
					ready = false;
					return value;
				};
			}
			let rendered: ReturnType<typeof mount> | null = null;
			try {
				const { Page } = loadCompiledFixtureSource(sourceFor(expression, ext, 'argument'), {
					id: `/project/AuthoredReadiness.${ext}`,
					mode,
					compileOptions: { hmr: false, dev },
				});
				// A fulfilled request isolates dependency evaluation from a retry
				// after suspension, which may legitimately call authored code again.
				const props = {
					id: 'fallback',
					load(argument: unknown) {
						const value = typeof argument === 'function' ? argument() : argument;
						return Object.assign(Promise.resolve(value), { status: 'fulfilled', value });
					},
				};
				if (mode === 'server') {
					expect((await prerender(Page, props)).html).toContain('<p>present</p>');
				} else {
					rendered = mount(Page, props);
					await act(async () => {});
					expect(rendered.find('p').textContent).toBe('present');
				}
			} finally {
				rendered?.unmount();
				delete globals.creationOptionalGlobal;
				delete globals.creationCheckReadiness;
			}
		},
	);

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
