import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement, flushSync, hydrateRoot } from 'octane';
import * as Server from 'octane/server';
import { mount } from '../_helpers.js';
import { loadServerFixture } from '../_server-fixture.js';
import { collectPipeableStream, collectReadableStream } from '../_server-stream.js';
import * as client from './_fixtures/aria-diagnostics.tsrx';

const PROD_COMPILE = process.env.OCTANE_TEST_COMPILE_MODE === 'prod';
const FIXTURE = 'packages/octane/tests/conformance/_fixtures/aria-diagnostics.tsrx';
const devServer = loadServerFixture<typeof client>(FIXTURE, { compileOptions: { dev: true } });
const prodServer = loadServerFixture<typeof client>(FIXTURE, { compileOptions: { dev: false } });

function errorMessages(spy: ReturnType<typeof vi.spyOn>): string[] {
	return spy.mock.calls.map((call) => call.map(String).join(' '));
}

function unknownAriaWarning(name: string, tag = 'div'): string {
	return `Invalid aria prop \`${name}\` on <${tag}> tag. ARIA attributes must use valid, lowercase aria-* names.`;
}

function unknownAriaWarnings(names: string[], tag = 'div'): string {
	const quoted = names.map((name) => `\`${name}\``).join(', ');
	return `Invalid aria props ${quoted} on <${tag}> tag. ARIA attributes must use valid, lowercase aria-* names.`;
}

function expectClientWarnings(spy: ReturnType<typeof vi.spyOn>, messages: string[]): void {
	expect(errorMessages(spy)).toEqual(PROD_COMPILE ? [] : messages);
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('ReactDOMInvalidARIAHook warning parity', () => {
	// Per ReactDOMInvalidARIAHook-test.js:37,41 — recognized ARIA 1.2 and 1.3
	// attributes retain their public DOM values without producing diagnostics.
	it('accepts recognized ARIA attributes, including every React-supported ARIA 1.3 addition', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const rendered = mount(client.ValidAriaAttributes, { hidden: false });
		try {
			const element = rendered.find('#aria-valid');
			expect(element.getAttribute('aria-label')).toBe('accessible label');
			expect(element.getAttribute('aria-description')).toBe('accessible description');
			expect(element.getAttribute('aria-hidden')).toBe('false');
			expect(element.getAttribute('aria-haspopup')).toBe('menu');
			expect(element.getAttribute('aria-braillelabel')).toBe('braille label');
			expect(element.getAttribute('aria-brailleroledescription')).toBe('navigation');
			expect(element.getAttribute('aria-colindextext')).toBe('column one');
			expect(element.getAttribute('aria-rowindextext')).toBe('row one');
			expect(errorMessages(error)).toEqual([]);
		} finally {
			rendered.unmount();
		}
	});

	// Per ReactDOMInvalidARIAHook-test.js:61 — an unknown lowercase ARIA name
	// remains in the DOM, but tells the author that it is not a recognized state.
	it('warns for one unknown ARIA attribute supplied through a JSX spread', () => {
		const name = 'aria-clientinvalid';
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const rendered = mount(client.SpreadAriaAttributes, { attributes: { [name]: 'yes' } });
		try {
			expect(rendered.find('#aria-spread').getAttribute(name)).toBe('yes');
			expectClientWarnings(error, [unknownAriaWarning(name)]);
		} finally {
			rendered.unmount();
		}
	});

	// Per ReactDOMInvalidARIAHook-test.js:69 — related unknown names on the same
	// host appear together in one actionable plural diagnostic.
	it('groups multiple unknown ARIA attributes on one host into a plural warning', () => {
		const names = ['aria-groupone', 'aria-grouptwo'];
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const rendered = mount(client.SpreadAriaAttributes, {
			attributes: { [names[0]]: 'first', [names[1]]: 'second' },
		});
		try {
			const element = rendered.find('#aria-spread');
			expect(element.getAttribute(names[0])).toBe('first');
			expect(element.getAttribute(names[1])).toBe('second');
			expectClientWarnings(error, [unknownAriaWarnings(names)]);
		} finally {
			rendered.unmount();
		}
	});

	// Per ReactDOMInvalidARIAHook-test.js:79 — preserve authored spelling in the
	// warning even when the HTML DOM normalizes the applied attribute name.
	it('suggests the lowercase spelling of a miscased aria-* attribute', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const rendered = mount(client.SpreadAriaAttributes, {
			attributes: { 'aria-hasPopup': 'true' },
		});
		try {
			expect(rendered.find('#aria-spread').getAttribute('aria-haspopup')).toBe('true');
			expectClientWarnings(error, [
				'Unknown ARIA attribute `aria-hasPopup`. Did you mean `aria-haspopup`?',
			]);
		} finally {
			rendered.unmount();
		}
	});

	// Per ReactDOMInvalidARIAHook-test.js:89 — a recognized camelCase spelling
	// points directly to its correct lowercase, hyphenated ARIA attribute.
	it('suggests the recognized lowercase spelling for camelCase ARIA attributes', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const rendered = mount(client.SpreadAriaAttributes, {
			attributes: { ariaHasPopup: 'true' },
		});
		try {
			expect(rendered.find('#aria-spread').getAttribute('ariahaspopup')).toBe('true');
			expectClientWarnings(error, [
				'Invalid ARIA attribute `ariaHasPopup`. Did you mean `aria-haspopup`?',
			]);
		} finally {
			rendered.unmount();
		}
	});

	// Per ReactDOMInvalidARIAHook-test.js:99 — an unknown camelCase spelling
	// receives useful naming guidance without inventing a nonexistent suggestion.
	it('explains the required lowercase naming pattern for unknown camelCase ARIA attributes', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const rendered = mount(client.SpreadAriaAttributes, {
			attributes: { ariaSomethingInvalid: 'true' },
		});
		try {
			expect(rendered.find('#aria-spread').getAttribute('ariasomethinginvalid')).toBe('true');
			expectClientWarnings(error, [
				'Invalid ARIA attribute `ariaSomethingInvalid`. ARIA attributes follow the pattern aria-* and must be lowercase.',
			]);
		} finally {
			rendered.unmount();
		}
	});

	// Per ReactDOMInvalidARIAHook.js:26-29 — direct optimized ARIA bindings use
	// the same validation and retain the same value serialization as spread props.
	it('warns for an unknown ARIA attribute on a direct dynamic binding', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const rendered = mount(client.DynamicUnknownAria, { value: 'dynamic' });
		try {
			expect(rendered.find('#aria-dynamic').getAttribute('aria-dynamicinvalid')).toBe('dynamic');
			expectClientWarnings(error, [unknownAriaWarning('aria-dynamicinvalid')]);
		} finally {
			rendered.unmount();
		}
	});

	// Per ReactDOMInvalidARIAHook-test.js:61 — a compile-time literal must not
	// disappear into template HTML before development validation can inspect it.
	it('warns for an unknown statically authored ARIA attribute', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const rendered = mount(client.StaticUnknownAria);
		try {
			expect(rendered.find('#aria-static').getAttribute('aria-staticinvalid')).toBe('invalid');
			expectClientWarnings(error, [unknownAriaWarning('aria-staticinvalid')]);
		} finally {
			rendered.unmount();
		}
	});

	// Per ReactDOMInvalidARIAHook-test.js:79,89 — static casing errors receive
	// the same authored-name suggestions as their dynamic counterparts.
	it.each([
		{
			component: client.StaticCamelCaseAria,
			selector: '#aria-static-camel',
			name: 'arialabel',
			warning: 'Invalid ARIA attribute `ariaLabel`. Did you mean `aria-label`?',
		},
		{
			component: client.StaticMiscasedAria,
			selector: '#aria-static-miscased',
			name: 'aria-haspopup',
			warning: 'Unknown ARIA attribute `aria-hasPopUp`. Did you mean `aria-haspopup`?',
		},
	])('warns for static ARIA casing: $warning', ({ component, selector, name, warning }) => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const rendered = mount(component);
		try {
			expect(rendered.find(selector).getAttribute(name)).not.toBeNull();
			expectClientWarnings(error, [warning]);
		} finally {
			rendered.unmount();
		}
	});

	// Per ReactDOMUnknownPropertyHook.js:110-115 — `aria` itself is reserved;
	// keep its current DOM serialization while explaining the supported form.
	it('warns that the bare aria attribute is reserved', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const rendered = mount(client.StaticBareAria);
		try {
			expect(rendered.find('#aria-static-bare').getAttribute('aria')).toBe('reserved');
			expectClientWarnings(error, [
				'The `aria` attribute is reserved for future use. Pass individual `aria-*` attributes instead.',
			]);
		} finally {
			rendered.unmount();
		}
	});

	// Per ReactDOMInvalidARIAHook.js:17-21 — warning state belongs to the client
	// renderer module, so the same authored typo is reported once across roots.
	it('deduplicates an invalid ARIA name across separate client roots', () => {
		const name = 'aria-dedupclient';
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const first = mount(client.SpreadAriaAttributes, { attributes: { [name]: 'first' } });
		const second = mount(client.SpreadAriaAttributes, { attributes: { [name]: 'second' } });
		try {
			expect(first.find('#aria-spread').getAttribute(name)).toBe('first');
			expect(second.find('#aria-spread').getAttribute(name)).toBe('second');
			expectClientWarnings(error, [unknownAriaWarning(name)]);
		} finally {
			first.unmount();
			second.unmount();
		}
	});

	// Per ReactDOMUnknownPropertyHook.js:371-374 — custom HTML elements own their
	// raw attributes and must not inherit native-host ARIA validation.
	it('preserves invalid-looking ARIA attributes silently on custom elements', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const attributes = {
			'aria-custominvalid': 'custom',
			ariaCustomInvalid: 'camel',
		};
		const rendered = mount(client.CustomAriaAttributes, { attributes });
		try {
			const element = rendered.find('#aria-custom');
			expect(element.getAttribute('aria-custominvalid')).toBe('custom');
			expect(element.getAttribute('ariacustominvalid')).toBe('camel');
			expect(errorMessages(error)).toEqual([]);
		} finally {
			rendered.unmount();
		}
	});

	// Per ReactDOMInvalidARIAHook.js:24-82 — SVG hosts are native DOM elements,
	// so they receive the same typo guidance without changing SVG serialization.
	it('validates unknown ARIA attributes on native SVG elements', () => {
		const name = 'aria-svginvalid';
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const rendered = mount(client.SvgAriaAttributes, { attributes: { [name]: 'svg' } });
		try {
			expect(rendered.find('#aria-svg').getAttribute(name)).toBe('svg');
			expectClientWarnings(error, [unknownAriaWarning(name, 'svg')]);
		} finally {
			rendered.unmount();
		}
	});
});

describe('server and hydration ARIA diagnostics', () => {
	// Per ReactDOMInvalidARIAHook-test.js:37,41 — the server recognizes the
	// same ARIA 1.2 and 1.3 attributes as the client without false diagnostics.
	it('accepts recognized ARIA attributes and every React-supported ARIA 1.3 addition during SSR', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		for (const render of [Server.renderToString, Server.renderToStaticMarkup]) {
			const html = render(devServer.ValidAriaAttributes, { hidden: false }).html;
			expect(html).toContain('aria-label="accessible label"');
			expect(html).toContain('aria-description="accessible description"');
			expect(html).toContain('aria-hidden="false"');
			expect(html).toContain('aria-haspopup="menu"');
			expect(html).toContain('aria-braillelabel="braille label"');
			expect(html).toContain('aria-brailleroledescription="navigation"');
			expect(html).toContain('aria-colindextext="column one"');
			expect(html).toContain('aria-rowindextext="row one"');
		}
		expect(errorMessages(error)).toEqual([]);
	});

	// Per ReactDOMInvalidARIAHook-test.js:61 and ReactFizzConfigDOM.js host
	// validation — buffered server output reports and preserves unknown names.
	it('warns for an invalid ARIA attribute in buffered server output', () => {
		const name = 'aria-serverinvalid';
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const html = Server.renderToString(devServer.SpreadAriaAttributes, {
			attributes: { [name]: 'server' },
		}).html;
		expect(html).toContain(`${name}="server"`);
		expect(errorMessages(error)).toEqual([unknownAriaWarning(name)]);
	});

	// Per ReactDOMInvalidARIAHook-test.js:69 — server-side JSX spread resolution
	// groups unknown names exactly once for the final native-host prop snapshot.
	it('groups multiple unknown server-side ARIA names into one plural warning', () => {
		const names = ['aria-serverone', 'aria-servertwo'];
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const html = Server.renderToStaticMarkup(devServer.SpreadAriaAttributes, {
			attributes: { [names[0]]: 'first', [names[1]]: 'second' },
		}).html;
		expect(html).toContain(`${names[0]}="first"`);
		expect(html).toContain(`${names[1]}="second"`);
		expect(errorMessages(error)).toEqual([unknownAriaWarnings(names)]);
	});

	// Per ReactDOMInvalidARIAHook-test.js:79,89,99 — all casing diagnostics use
	// the authored spelling before SSR emits its browser-compatible attributes.
	it.each([
		{
			name: 'aria-HasPopup',
			warning: 'Unknown ARIA attribute `aria-HasPopup`. Did you mean `aria-haspopup`?',
		},
		{
			name: 'ariaHidden',
			warning: 'Invalid ARIA attribute `ariaHidden`. Did you mean `aria-hidden`?',
		},
		{
			name: 'ariaServerUnknown',
			warning:
				'Invalid ARIA attribute `ariaServerUnknown`. ARIA attributes follow the pattern aria-* and must be lowercase.',
		},
	])('reports server ARIA casing guidance for $name', ({ name, warning }) => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const html = Server.renderToString(devServer.SpreadAriaAttributes, {
			attributes: { [name]: 'server' },
		}).html;
		expect(html).toContain(`${name}="server"`);
		expect(errorMessages(error)).toEqual([warning]);
	});

	// Per ReactDOMInvalidARIAHook-test.js:61 — compiler-baked server attributes
	// remain observable to DEV validation without changing production HTML.
	it('warns for an invalid statically authored server-side ARIA attribute', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const html = Server.renderToString(devServer.StaticUnknownAria).html;
		expect(html).toContain('aria-staticinvalid="invalid"');
		expect(errorMessages(error)).toEqual([unknownAriaWarning('aria-staticinvalid')]);
	});

	// Per ReactDOMInvalidARIAHook.js:17-21 — the server renderer owns its warning
	// cache across independent requests while preserving both request outputs.
	it('deduplicates ARIA diagnostics across independent server render calls', () => {
		const name = 'aria-serverdedup';
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const first = Server.renderToString(devServer.SpreadAriaAttributes, {
			attributes: { [name]: 'first' },
		}).html;
		const second = Server.renderToString(devServer.SpreadAriaAttributes, {
			attributes: { [name]: 'second' },
		}).html;
		expect(first).toContain(`${name}="first"`);
		expect(second).toContain(`${name}="second"`);
		expect(errorMessages(error)).toEqual([unknownAriaWarning(name)]);
	});

	// Per ReactDOMInvalidARIAHook-test.js:69 — host descriptors created through
	// the public server API share spread-host aggregation and custom-host rules.
	it('groups unknown ARIA names on public server element descriptors', () => {
		const names = ['aria-descriptorone', 'aria-descriptortwo'];
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const Descriptor = () =>
			Server.createElement('div', { [names[0]]: 'first', [names[1]]: 'second' });
		const html = Server.renderToString(Descriptor).html;
		expect(html).toContain(`${names[0]}="first"`);
		expect(html).toContain(`${names[1]}="second"`);
		expect(errorMessages(error)).toEqual([unknownAriaWarnings(names)]);
	});

	// Per ReactFizzConfigDOM.js host validation — streaming renderers expose the
	// same diagnostic while retaining both their bytes and stream success state.
	it.each([
		{ name: 'pipeable', render: collectPipeableStream, attribute: 'aria-streaminvalid' },
		{ name: 'readable', render: collectReadableStream, attribute: 'aria-readableinvalid' },
	])('reports invalid ARIA attributes in $name streaming output', async ({ render, attribute }) => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const result = await render(devServer.SpreadAriaAttributes, {
			attributes: { [attribute]: 'stream' },
		});
		expect(result.html).toContain(`${attribute}="stream"`);
		expect(result.errors).toEqual([]);
		expect(errorMessages(error)).toEqual([unknownAriaWarning(attribute)]);
	});

	// Per ReactDOMUnknownPropertyHook.js:371-374 — custom elements remain raw
	// and quiet on the server just as they do when mounted in the browser.
	it('preserves custom-element ARIA attributes without a server warning', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const html = Server.renderToString(devServer.CustomAriaAttributes, {
			attributes: { 'aria-servercustom': 'custom', ariaServerCustom: 'camel' },
		}).html;
		expect(html).toContain('aria-servercustom="custom"');
		expect(html).toContain('ariaServerCustom="camel"');
		expect(errorMessages(error)).toEqual([]);
	});

	// Per ReactDOMInvalidARIAHook.js:24-82 — hydration reports the typo through
	// the client renderer while adopting the server-rendered native host node.
	it('warns during matching hydration without replacing server-rendered DOM', () => {
		const name = 'aria-hydrationinvalid';
		const attributes = { [name]: 'hydrated' };
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const html = Server.renderToString(devServer.SpreadAriaAttributes, { attributes }).html;
		const container = document.createElement('div');
		container.innerHTML = html;
		const original = container.querySelector('#aria-spread');
		error.mockClear();
		const root = hydrateRoot(container, client.SpreadAriaAttributes, { attributes });
		try {
			flushSync(() => {});
			expect(container.querySelector('#aria-spread')).toBe(original);
			expect(original?.getAttribute(name)).toBe('hydrated');
			expectClientWarnings(error, [unknownAriaWarning(name)]);
		} finally {
			root.unmount();
		}
	});

	// Per ReactDOMInvalidARIAHook.js __DEV__ guards — warnings disappear from a
	// production runtime without changing public server attribute serialization.
	it('keeps production server rendering silent across descriptor and compiled paths', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const originalNodeEnv = process.env.NODE_ENV;
		process.env.NODE_ENV = 'production';
		try {
			const compiled = Server.renderToString(prodServer.SpreadAriaAttributes, {
				attributes: { 'aria-productionsilent': 'compiled' },
			}).html;
			const Descriptor = () => createElement('div', { 'aria-productiondescriptor': 'descriptor' });
			const descriptor = Server.renderToString(Descriptor).html;
			expect(compiled).toContain('aria-productionsilent="compiled"');
			expect(descriptor).toContain('aria-productiondescriptor="descriptor"');
		} finally {
			if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
			else process.env.NODE_ENV = originalNodeEnv;
		}
		expect(errorMessages(error)).toEqual([]);
	});
});
