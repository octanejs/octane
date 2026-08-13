import { resolve } from 'node:path';
import { flushSync, hydrateRoot } from 'octane';
import { renderToStaticMarkup, renderToString } from 'octane/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '../_helpers';
import { loadServerFixture } from '../_server-fixture.js';
import { collectPipeableStream, collectReadableStream } from '../_server-stream.js';
import {
	MixedInvalidHydrationStyleObj,
	MixedInvalidStaticStyleObj,
	MixedStyleObj,
	StaticInvalidHydrationStyleObj,
	StaticInvalidStyleObj,
	StyleObj,
} from './_fixtures/css-properties.tsrx';

const PROD_COMPILE = process.env.OCTANE_TEST_COMPILE_MODE === 'prod';
const server = loadServerFixture(resolve(__dirname, '_fixtures/css-properties.tsrx'), {
	compileOptions: { dev: true },
});
const pairedServer = PROD_COMPILE
	? loadServerFixture(resolve(__dirname, '_fixtures/css-properties.tsrx'), {
			compileOptions: { dev: false },
		})
	: server;

function captureErrors() {
	return vi.spyOn(console, 'error').mockImplementation(() => {});
}

function messages(error: ReturnType<typeof captureErrors>): string[] {
	return error.mock.calls.map((call) => call.map(String).join(' '));
}

function vendorWarning(name: string): string {
	return (
		`Unsupported vendor-prefixed style property ${name}. ` +
		`Did you mean ${name.charAt(0).toUpperCase()}${name.slice(1)}?`
	);
}

function semicolonWarning(name: string, value: string): string {
	return (
		"Style property values shouldn't contain a semicolon. " +
		`Try "${name}: ${value.slice(0, value.lastIndexOf(';'))}" instead.`
	);
}

function coercionWarning(name: string, type: string): string {
	return (
		`The provided \`${name}\` CSS property is an unsupported type ${type}. ` +
		'This value must be coerced to a string before using it here.'
	);
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('CSSPropertyOperations — client development diagnostics', () => {
	// Per CSSPropertyOperations-test.js:149,184,219,254. React reports each
	// diagnostic on console.error while retaining the existing CSSOM behavior.
	it('warns for vendor casing, trailing semicolons, NaN, and Infinity', () => {
		const error = captureErrors();
		const root = mount(StyleObj, {
			s: {
				webkitTransform: 'scale(1)',
				color: 'red;',
				width: Number.NaN,
				height: Number.POSITIVE_INFINITY,
			},
		});
		try {
			expect(messages(error)).toEqual(
				PROD_COMPILE
					? []
					: [
							vendorWarning('webkitTransform'),
							semicolonWarning('color', 'red;'),
							'`NaN` is an invalid value for the `width` css style property.',
							'`Infinity` is an invalid value for the `height` css style property.',
						],
			);
		} finally {
			root.unmount();
		}
	});

	// Per CSSPropertyOperations-test.js:149,184: malformed vendor names dedupe
	// by property, and trailing-semicolon diagnostics dedupe by original value.
	it('deduplicates vendor names and semicolon values across roots and updates', () => {
		const error = captureErrors();
		const value = 'repeat-diagnostic;';
		const first = mount(StyleObj, { s: { webkitMaskImage: 'none', color: value } });
		let second: ReturnType<typeof mount> | undefined;
		try {
			first.update(StyleObj, {
				s: { webkitMaskImage: 'linear-gradient(red, blue)', backgroundColor: value },
			});
			second = mount(StyleObj, { s: { webkitMaskImage: 'none', borderColor: value } });
			expect(messages(error)).toEqual(
				PROD_COMPILE ? [] : [vendorWarning('webkitMaskImage'), semicolonWarning('color', value)],
			);
		} finally {
			second?.unmount();
			first.unmount();
		}
	});

	// Per CSSPropertyOperations-test.js:184. A compiler-specialized dynamic
	// declaration must report the same diagnostic as a dynamic style object.
	it('warns for dynamic declarations beside compiler-baked static styles', () => {
		const error = captureErrors();
		const root = mount(MixedStyleObj, { color: 'orange;' });
		try {
			expect((root.find('#mixed-style-object') as HTMLElement).style.position).toBe('absolute');
			expect(messages(error)).toEqual(PROD_COMPILE ? [] : [semicolonWarning('color', 'orange;')]);
		} finally {
			root.unmount();
		}
	});

	// Per CSSPropertyOperations-test.js:149,184. Static literal authoring is
	// diagnosed in development while production retains its compile-time bake.
	it('warns for malformed vendors and semicolons in fully static style literals', () => {
		const error = captureErrors();
		const root = mount(StaticInvalidStyleObj);
		try {
			expect(root.find('#static-invalid-style-object')).toBeInstanceOf(HTMLElement);
			expect(messages(error)).toEqual(
				PROD_COMPILE
					? []
					: [
							vendorWarning('webkitStaticLiteralTransform'),
							semicolonWarning('color', 'static-literal-warning;'),
						],
			);
		} finally {
			root.unmount();
		}
	});

	it('warns for invalid static declarations beside a valid dynamic style value', () => {
		const error = captureErrors();
		const root = mount(MixedInvalidStaticStyleObj, { color: 'blue' });
		try {
			expect((root.find('#mixed-invalid-static-style-object') as HTMLElement).style.color).toBe(
				'blue',
			);
			expect(messages(error)).toEqual(
				PROD_COMPILE ? [] : [vendorWarning('webkitMixedLiteralTransform')],
			);
		} finally {
			root.unmount();
		}
	});

	it('reads effectful style getters exactly once while publishing development warnings', () => {
		const error = captureErrors();
		let reads = 0;
		const root = mount(StyleObj, {
			s: {
				get color() {
					reads++;
					return 'getter-warning;';
				},
			},
		});
		try {
			expect(reads).toBe(1);
			expect(messages(error)).toEqual(
				PROD_COMPILE ? [] : [semicolonWarning('color', 'getter-warning;')],
			);
		} finally {
			root.unmount();
		}
	});

	it('coerces effectful style values exactly once without introducing warnings', () => {
		const error = captureErrors();
		let coercions = 0;
		const color = {
			toString() {
				coercions++;
				return 'blue';
			},
		};
		const root = mount(StyleObj, { s: { color } });
		try {
			expect((root.find('#so') as HTMLElement).style.color).toBe('blue');
			expect(coercions).toBe(1);
			expect(messages(error)).toEqual([]);
		} finally {
			root.unmount();
		}
	});

	// Per CSSPropertyOperations-test.js:240. Custom properties bypass style-name,
	// semicolon, and numeric validation. OCTANE DIVERGENCE: hyphenated names and
	// full cssText strings are supported authoring forms and must remain silent.
	it('keeps custom properties, valid vendors, supported kebab keys, and cssText silent', () => {
		const error = captureErrors();
		const root = mount(StyleObj, {
			s: {
				'--someColor': 'red;',
				'--nan': Number.NaN,
				'--infinity': Number.POSITIVE_INFINITY,
				'font-size': '14px',
				WebkitTransform: 'scale(1)',
				MozTransition: 'none',
				msTransition: 'none',
				color: 'blue',
			},
		});
		try {
			const element = root.find('#so') as HTMLElement;
			expect(element.style.fontSize).toBe('14px');
			expect(element.style.color).toBe('blue');
			expect(element.style.getPropertyValue('--nan')).toBe('NaN');
			expect(element.style.getPropertyValue('--infinity')).toBe('Infinity');
			root.update(StyleObj, { s: 'color: green; font-size: 16px;' });
			expect(element.style.color).toBe('green');
			expect(element.style.fontSize).toBe('16px');
			expect(messages(error)).toEqual([]);
		} finally {
			root.unmount();
		}
	});

	// Per ReactDOMComponent-test.js:340 and CheckStringCoercion.js:135. Preserve
	// the original coercion exception while publishing actionable DEV guidance.
	it('diagnoses unsupported style coercion without replacing its exception', () => {
		class TemporalLike {
			valueOf() {
				throw new TypeError('Temporal values cannot be coerced');
			}
			toString() {
				return '2020-01-01';
			}
		}
		const error = captureErrors();
		expect(() => mount(StyleObj, { s: { fontSize: new TemporalLike() } })).toThrowError(
			new TypeError('Temporal values cannot be coerced'),
		);
		expect(messages(error)).toEqual(
			PROD_COMPILE ? [] : [coercionWarning('fontSize', 'TemporalLike')],
		);
	});

	it('diagnoses unsupported custom-property coercion without treating it as a bad name', () => {
		const error = captureErrors();
		expect(() => mount(StyleObj, { s: { '--unsupported': Symbol('unsupported') } })).toThrow(
			TypeError,
		);
		expect(messages(error)).toEqual(
			PROD_COMPILE ? [] : [coercionWarning('--unsupported', 'Symbol')],
		);
	});
});

describe('CSSPropertyOperations — server development diagnostics', () => {
	// Per CSSPropertyOperations-test.js:149,184,219,254 and ReactFizzConfigDOM's
	// shared style validation: server warnings match the client and preserve HTML.
	it('warns for malformed vendors, semicolons, NaN, and Infinity during SSR', () => {
		const error = captureErrors();
		const { html } = renderToString(server.StyleObj, {
			s: {
				mozTransform: 'scale(1)',
				color: 'blue;',
				width: Number.NaN,
				height: Number.NEGATIVE_INFINITY,
			},
		});
		expect(html).toContain('width:NaNpx;height:-Infinitypx');
		expect(messages(error)).toEqual([
			vendorWarning('mozTransform'),
			semicolonWarning('color', 'blue;'),
			'`NaN` is an invalid value for the `width` css style property.',
			'`Infinity` is an invalid value for the `height` css style property.',
		]);
	});

	it('warns for malformed vendors and semicolons in fully static SSR style literals', () => {
		const error = captureErrors();
		const { html } = renderToString(server.StaticInvalidStyleObj);
		expect(html).toContain('id="static-invalid-style-object"');
		expect(messages(error)).toEqual([
			vendorWarning('webkitStaticLiteralTransform'),
			semicolonWarning('color', 'static-literal-warning;'),
		]);
	});

	it('warns for invalid static declarations beside a dynamic value during SSR', () => {
		const error = captureErrors();
		const { html } = renderToString(server.MixedInvalidStaticStyleObj, { color: 'blue' });
		expect(html).toContain('color:blue;');
		expect(messages(error)).toEqual([vendorWarning('webkitMixedLiteralTransform')]);
	});

	// The same serializer backs static and both streaming APIs. Distinct inputs
	// keep the intentional renderer-module warning cache observable.
	it.each([
		{
			name: 'renderToStaticMarkup',
			vendor: 'webkitStaticTransition',
			value: 'static-warning;',
			render: (props: unknown) => renderToStaticMarkup(server.StyleObj, props).html,
		},
		{
			name: 'renderToPipeableStream',
			vendor: 'mozPipeableTransition',
			value: 'pipeable-warning;',
			render: async (props: unknown) => (await collectPipeableStream(server.StyleObj, props)).html,
		},
		{
			name: 'renderToReadableStream',
			vendor: 'oReadableTransition',
			value: 'readable-warning;',
			render: async (props: unknown) => (await collectReadableStream(server.StyleObj, props)).html,
		},
	])('reports style diagnostics through $name', async ({ vendor, value, render }) => {
		const error = captureErrors();
		const html = await render({ s: { [vendor]: 'none', color: value } });
		expect(html).toContain('id="so"');
		expect(messages(error)).toEqual([vendorWarning(vendor), semicolonWarning('color', value)]);
	});

	// Per CSSPropertyOperations-test.js:149,184. SSR warnings persist across
	// independent render calls, rather than restarting on each request.
	it('deduplicates malformed vendors and semicolon values across SSR renders', () => {
		const error = captureErrors();
		const value = 'cross-render-warning;';
		renderToString(server.StyleObj, { s: { webkitCrossRenderTransform: 'none', color: value } });
		renderToString(server.StyleObj, {
			s: { webkitCrossRenderTransform: 'rotate(0)', backgroundColor: value },
		});
		expect(messages(error)).toEqual([
			vendorWarning('webkitCrossRenderTransform'),
			semicolonWarning('color', value),
		]);
	});

	// Per CSSPropertyOperations-test.js:240. Octane additionally accepts native
	// kebab-case keys and complete style strings, so neither form is a warning.
	it('keeps custom properties, supported hyphenated names, and cssText silent in SSR', () => {
		const error = captureErrors();
		const objectHtml = renderToString(server.StyleObj, {
			s: {
				'--someColor': 'red;',
				'--nan': Number.NaN,
				'--infinity': Number.POSITIVE_INFINITY,
				'font-size': '14px',
				WebkitTransform: 'scale(1)',
				msTransition: 'none',
			},
		}).html;
		const stringHtml = renderToString(server.StyleObj, {
			s: 'color: green; font-size: 16px;',
		}).html;
		expect(objectHtml).toContain('--nan:NaN;--infinity:Infinity;font-size:14px');
		expect(stringHtml).toContain('style="color: green; font-size: 16px;"');
		expect(messages(error)).toEqual([]);
	});

	it('preserves unsupported server-side coercion errors with actionable diagnostics', () => {
		const error = captureErrors();
		expect(() =>
			renderToString(server.StyleObj, { s: { '--unsupported': Symbol('server') } }),
		).toThrow(TypeError);
		expect(messages(error)).toEqual([coercionWarning('--unsupported', 'Symbol')]);
	});

	it('coerces effectful server-side style values exactly once', () => {
		const error = captureErrors();
		let coercions = 0;
		const color = {
			toString() {
				coercions++;
				return 'blue';
			},
		};
		const { html } = renderToString(server.StyleObj, { s: { color } });
		expect(html).toContain('color:blue;');
		expect(coercions).toBe(1);
		expect(messages(error)).toEqual([]);
	});

	// Client and SSR warning caches are renderer-specific: an SSR warning must
	// not suppress the matching diagnostic while adopting its rendered host.
	it('validates style values independently while hydrating server markup', () => {
		const error = captureErrors();
		const style = { webkitDynamicHydrationTransform: 'scale(1)', color: 'purple' };
		const { html } = renderToString(server.StyleObj, { s: style });
		const container = document.createElement('div');
		container.innerHTML = html;
		const original = container.querySelector('#so');
		let root: ReturnType<typeof hydrateRoot> | undefined;
		try {
			root = hydrateRoot(container, StyleObj, { s: style });
			flushSync(() => {});
			expect(container.querySelector('#so')).toBe(original);
			expect(messages(error)).toEqual(
				PROD_COMPILE
					? [vendorWarning('webkitDynamicHydrationTransform')]
					: [
							vendorWarning('webkitDynamicHydrationTransform'),
							vendorWarning('webkitDynamicHydrationTransform'),
						],
			);
		} finally {
			root?.unmount();
		}
	});

	it.each([
		{
			name: 'fully static invalid styles',
			id: '#static-invalid-hydration-style-object',
			serverComponent: pairedServer.StaticInvalidHydrationStyleObj,
			clientComponent: StaticInvalidHydrationStyleObj,
			props: undefined,
			vendor: 'webkitStaticHydrationTransform',
			serverDynamic: false,
		},
		{
			name: 'mixed invalid static and valid dynamic styles',
			id: '#mixed-invalid-hydration-style-object',
			serverComponent: pairedServer.MixedInvalidHydrationStyleObj,
			clientComponent: MixedInvalidHydrationStyleObj,
			props: { color: 'blue' },
			vendor: 'webkitMixedHydrationTransform',
			serverDynamic: true,
		},
	])(
		'adopts $name without introducing hydration mismatch diagnostics',
		({ id, serverComponent, clientComponent, props, vendor, serverDynamic }) => {
			const error = captureErrors();
			const { html } = renderToString(serverComponent, props);
			const container = document.createElement('div');
			container.innerHTML = html;
			const original = container.querySelector(id);
			let root: ReturnType<typeof hydrateRoot> | undefined;
			try {
				root = hydrateRoot(container, clientComponent, props);
				flushSync(() => {});
				expect(container.querySelector(id)).toBe(original);
				expect((original as HTMLElement).style.color).toBe('blue');
				expect(messages(error)).toEqual(
					PROD_COMPILE
						? serverDynamic
							? [vendorWarning(vendor)]
							: []
						: [vendorWarning(vendor), vendorWarning(vendor)],
				);
			} finally {
				root?.unmount();
			}
		},
	);

	// Runtime production guards complement the octane-prod compiler-mode checks
	// above and optimized-runtime bundle coverage.
	it('keeps production client and server rendering silent', () => {
		const error = captureErrors();
		const previousNodeEnv = process.env.NODE_ENV;
		process.env.NODE_ENV = 'production';
		let root: ReturnType<typeof mount> | undefined;
		try {
			const style = { webkitProductionTransform: 'none', color: 'production-warning;' };
			root = mount(StyleObj, { s: style });
			const { html } = renderToString(server.StyleObj, { s: style });
			expect(html).toContain('webkit-production-transform:none');
			expect(messages(error)).toEqual([]);
		} finally {
			root?.unmount();
			if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
			else process.env.NODE_ENV = previousNodeEnv;
		}
	});
});
