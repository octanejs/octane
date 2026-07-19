import { resolve } from 'node:path';
import { createElement, renderToStaticMarkup, renderToString } from 'octane/server';
import { afterEach, expect, it, vi } from 'vitest';
import { loadServerFixture } from '../_server-fixture.js';
import { collectPipeableStream, collectReadableStream } from '../_server-stream.js';

const fixture = resolve(__dirname, '_fixtures/ssr-attribute-diagnostics.tsrx');
const dev = loadServerFixture(fixture, { compileOptions: { dev: true } });
const prod = loadServerFixture(fixture, { compileOptions: { dev: false } });

type FixtureModule = typeof dev;

const renderers = [
	{
		name: 'renderToString',
		render: async (module: FixtureModule, component: keyof FixtureModule, props?: unknown) =>
			renderToString(module[component], props).html,
	},
	{
		name: 'renderToStaticMarkup',
		render: async (module: FixtureModule, component: keyof FixtureModule, props?: unknown) =>
			renderToStaticMarkup(module[component], props).html,
	},
	{
		name: 'renderToPipeableStream',
		render: async (module: FixtureModule, component: keyof FixtureModule, props?: unknown) =>
			(await collectPipeableStream(module[component], props)).html,
	},
	{
		name: 'renderToReadableStream',
		render: async (module: FixtureModule, component: keyof FixtureModule, props?: unknown) =>
			(await collectReadableStream(module[component], props)).html,
	},
] as const;

function errors() {
	return vi.spyOn(console, 'error').mockImplementation(() => {});
}

function messages(spy: ReturnType<typeof errors>): string[] {
	return spy.mock.calls.map((call) => call.map(String).join(' '));
}

function invalidValueWarning(name: string, tag = 'div'): string {
	return (
		`Invalid value for prop \`${name}\` on <${tag}> tag. ` +
		'Either remove it from the element, or pass a string or number value to keep it in the DOM.'
	);
}

const expectedWarnings = [
	'Received `true` for a non-boolean attribute `title`. If you want to write it to the DOM, ' +
		'pass a string instead: title="true" or title={value.toString()}.',
	'Received `false` for a non-boolean attribute `alt`. If you used to conditionally omit it ' +
		'with alt={condition && value}, pass alt={condition ? value : undefined} instead.',
	'Received NaN for the `width` attribute. If this is expected, cast the value to a string.',
	invalidValueWarning('height'),
	invalidValueWarning('lang'),
	'The provided `dir` attribute is an object; it will stringify to "[object Object]". ' +
		'Pass a string (or a value with a meaningful toString) instead.',
	'Unknown event handler property `onclick` was dropped — did you mean `onClick`? ' +
		'(lowercase on* attributes never write; octane delegates camelCase handlers natively)',
] as const;

function expectInvalidMarkup(html: string): void {
	expect(html).not.toMatch(/id="boolean-true"[^>]*\stitle(?:=|\s|>)/);
	expect(html).toMatch(/id="boolean-true"[^>]*\sdata-ready="true"/);
	expect(html).toMatch(/id="boolean-true"[^>]*\saria-hidden="true"/);
	expect(html).toMatch(/id="boolean-true"[^>]*\shidden=""/);
	expect(html).not.toMatch(/id="boolean-false"[^>]*\salt(?:=|\s|>)/);
	expect(html).toMatch(/id="nan"[^>]*\swidth="NaN"/);
	expect(html).not.toMatch(/id="function"[^>]*\sheight(?:=|\s|>)/);
	expect(html).not.toMatch(/id="symbol"[^>]*\slang(?:=|\s|>)/);
	expect(html).toMatch(/id="plain-object"[^>]*\sdir="\[object Object\]"/);
	expect(html).toMatch(/id="meaningful-object"[^>]*\stranslate="meaningful"/);
	expect(html).not.toMatch(/id="lowercase-event"[^>]*\sonclick(?:=|\s|>)/);
}

function spreadAttributes(prefix: string): Record<string, unknown> {
	const handler = () => {};
	return {
		[`${prefix}true`]: true,
		[`${prefix}false`]: false,
		[`${prefix}nan`]: Number.NaN,
		[`${prefix}function`]: handler,
		[`${prefix}symbol`]: Symbol(prefix),
		[`${prefix}object`]: {},
		[`${prefix}meaningful`]: {
			toString() {
				return 'meaningful';
			},
		},
		[`on${prefix}click`]: handler,
	};
}

function spreadWarnings(prefix: string): string[] {
	const trueName = `${prefix}true`;
	const falseName = `${prefix}false`;
	const eventName = `on${prefix}click`;
	return [
		`Received \`true\` for a non-boolean attribute \`${trueName}\`. ` +
			`If you want to write it to the DOM, pass a string instead: ` +
			`${trueName}="true" or ${trueName}={value.toString()}.`,
		`Received \`false\` for a non-boolean attribute \`${falseName}\`. ` +
			`If you used to conditionally omit it with ${falseName}={condition && value}, ` +
			`pass ${falseName}={condition ? value : undefined} instead.`,
		`Received NaN for the \`${prefix}nan\` attribute. If this is expected, cast the value to a string.`,
		invalidValueWarning(`${prefix}function`),
		invalidValueWarning(`${prefix}symbol`),
		`The provided \`${prefix}object\` attribute is an object; it will stringify to ` +
			'"[object Object]". Pass a string (or a value with a meaningful toString) instead.',
		`Unknown event handler property \`${eventName}\` was dropped — did you mean ` +
			`\`on${prefix.charAt(0).toUpperCase()}${prefix.slice(1)}click\`? (lowercase on* ` +
			'attributes never write; octane delegates camelCase handlers natively)',
	];
}

function expectSpreadMarkup(html: string, prefix: string): void {
	expect(html).not.toContain(` ${prefix}true`);
	expect(html).not.toContain(` ${prefix}false`);
	expect(html).toContain(` ${prefix}nan="NaN"`);
	expect(html).not.toContain(` ${prefix}function`);
	expect(html).not.toContain(` ${prefix}symbol`);
	expect(html).toContain(` ${prefix}object="[object Object]"`);
	expect(html).toContain(` ${prefix}meaningful="meaningful"`);
	expect(html).not.toContain(` on${prefix}click`);
}

afterEach(() => {
	vi.restoreAllMocks();
});

// Per ReactDOMUnknownPropertyHook.js:81-93,134-141,191-278,338-367 and
// ReactFizzConfigDOM.js:4235-4238. Octane keeps its existing message wording.
it('reports DEV attribute diagnostics through renderToString', () => {
	const error = errors();
	const html = renderToString(dev.AttributeDiagnostics).html;

	expectInvalidMarkup(html);
	expect(messages(error)).toEqual(expectedWarnings);
});

// Per ReactFizzConfigDOM.js:4235-4238: the same property validator runs for
// static, pipeable-stream, and readable-stream server output.
it.each([
	{ ...renderers[1], prefix: 'static' },
	{ ...renderers[2], prefix: 'pipe' },
	{ ...renderers[3], prefix: 'read' },
])('reports DEV spread diagnostics through $name', async ({ render, prefix }) => {
	const error = errors();
	const html = await render(dev, 'SpreadAttributeDiagnostics', {
		attributes: spreadAttributes(prefix),
	});

	expectSpreadMarkup(html, prefix);
	expect(messages(error)).toEqual(spreadWarnings(prefix));
});

// Per ReactDOMUnknownPropertyHook.js:371-374: custom elements bypass shared
// property validation. Octane retains its raw custom-element serialization.
it.each(renderers)(
	'excludes custom elements from DEV diagnostics through $name',
	async ({ render }) => {
		const error = errors();
		const html = await render(dev, 'CustomElementDiagnostics');

		expect(messages(error)).toEqual([]);
		expect(html).toContain(' true-value');
		expect(html).not.toContain(' false-value');
		expect(html).toContain(' nan-value="NaN"');
		expect(html).not.toContain(' function-value');
		expect(html).not.toContain(' symbol-value');
		expect(html).toContain(' object-value="[object Object]"');
		expect(html).toContain(' meaningful-value="meaningful"');
		expect(html).not.toContain(' onclick');
	},
);

// Per ReactDOMUnknownPropertyHook.js:17-19,338-367: warning names are cached by
// the renderer module, including across independent server render calls.
it('deduplicates descriptor diagnostics across render calls', () => {
	const error = errors();
	const Descriptor = () => createElement('div', { crossrenderfunction: () => {} });

	renderToString(Descriptor);
	renderToString(Descriptor);

	expect(messages(error)).toEqual([invalidValueWarning('crossrenderfunction')]);
});

// Per ReactFizzConfigDOM.js:4235-4238: hoisted <head> hosts pass through the
// same validation surface as ordinary body hosts.
it('validates attributes on hoisted head elements', () => {
	const error = errors();
	const html = renderToString(dev.HeadAttributeDiagnostics, {
		handler: () => {},
		truthy: true,
	}).html;

	expect(messages(error)).toEqual([
		invalidValueWarning('content', 'meta'),
		'Received `true` for a non-boolean attribute `headflag`. If you want to write it to ' +
			'the DOM, pass a string instead: headflag="true" or headflag={value.toString()}.',
		'Unknown event handler property `onheadclick` was dropped — did you mean `onHeadclick`? ' +
			'(lowercase on* attributes never write; octane delegates camelCase handlers natively)',
	]);
	expect(html).toContain('<meta name="ssr-attribute-diagnostics">');
	expect(html).not.toContain(' headflag');
	expect(html).not.toContain(' onheadclick');
});

// Per ReactFizzConfigDOM.js:4235: validation is DEV-only. This runtime-mode
// check complements the optimized-bundle assertion in production-error-bundle.
it('keeps production SSR silent across buffered and streaming APIs', async () => {
	const error = errors();
	const originalNodeEnv = process.env.NODE_ENV;
	process.env.NODE_ENV = 'production';
	try {
		for (let i = 0; i < renderers.length; i++) {
			const prefix = `prod${i}`;
			const html = await renderers[i].render(prod, 'SpreadAttributeDiagnostics', {
				attributes: spreadAttributes(prefix),
			});
			expectSpreadMarkup(html, prefix);
		}
	} finally {
		if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
		else process.env.NODE_ENV = originalNodeEnv;
	}
	expect(messages(error)).toEqual([]);
});
