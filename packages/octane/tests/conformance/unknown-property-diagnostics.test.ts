import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, hydrateRoot } from 'octane';
import * as Server from 'octane/server';
import { mount } from '../_helpers.js';
import { loadServerFixture } from '../_server-fixture.js';
import { collectPipeableStream, collectReadableStream } from '../_server-stream.js';
import * as client from './_fixtures/unknown-property-diagnostics.tsrx';

const PRODUCTION_COMPILE = process.env.OCTANE_TEST_COMPILE_MODE === 'prod';
const FIXTURE = 'packages/octane/tests/conformance/_fixtures/unknown-property-diagnostics.tsrx';
const devServer = loadServerFixture<typeof client>(FIXTURE, { compileOptions: { dev: true } });
const prodServer = loadServerFixture<typeof client>(FIXTURE, { compileOptions: { dev: false } });

function captureErrors() {
	return vi.spyOn(console, 'error').mockImplementation(() => {});
}

function messages(error: ReturnType<typeof captureErrors>): string[] {
	return error.mock.calls.map((call) => call.map(String).join(' '));
}

function expectClientWarnings(error: ReturnType<typeof captureErrors>, warnings: string[]): void {
	expect(messages(error)).toEqual(PRODUCTION_COMPILE ? [] : warnings);
}

function booleanStringWarning(name: string, value: 'true' | 'false'): string {
	return (
		`Received the string \`${value}\` for the boolean attribute \`${name}\`. ` +
		(value === 'false'
			? 'The browser will interpret it as a truthy value. '
			: 'Although this works, it will not work as expected if you pass the string "false". ') +
		`Did you mean ${name}={${value}}?`
	);
}

function unknownPropertyWarning(name: string): string {
	return (
		`Octane does not recognize the \`${name}\` prop on a DOM element. ` +
		`If you intentionally want it to appear in the DOM as a custom attribute, ` +
		`spell it as lowercase \`${name.toLowerCase()}\` instead. ` +
		'If you accidentally passed it from a parent component, remove it from the DOM element.'
	);
}

function groupedInvalidWarning(names: string[], tag = 'div'): string {
	const quoted = names.map((name) => `\`${name}\``).join(', ');
	return names.length === 1
		? `Invalid value for prop ${quoted} on <${tag}> tag. ` +
				'Either remove it from the element, or pass a string or number value to keep it in the DOM.'
		: `Invalid values for props ${quoted} on <${tag}> tag. ` +
				'Either remove them from the element, or pass a string or number value to keep them in the DOM.';
}

function innerHtmlWarning(): string {
	return (
		'Directly setting property `innerHTML` is not permitted. ' +
		'Use `dangerouslySetInnerHTML={{ __html: value }}` instead.'
	);
}

function nonStringIsWarning(type: string): string {
	return (
		`Received a \`${type}\` for a string attribute \`is\`. ` +
		'If this is expected, cast the value to a string.'
	);
}

function unknownEventWarning(name: string): string {
	return `Unknown event handler property \`${name}\`. It will be ignored.`;
}

function emptyUrlWarning(name: string): string {
	return (
		`An empty string was passed to the \`${name}\` attribute. ` +
		'This may cause the browser to download the whole page again. ' +
		'Pass null instead of an empty string.'
	);
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('React DOM unknown-property diagnostics', () => {
	// Per ReactDOMComponent-test.js:3611,3629 — boolean attributes interpret
	// both string spellings as present, but explain the ambiguous author intent.
	it.each([
		{
			component: client.DynamicBooleanProperty,
			selector: '#dynamic-boolean-property',
			name: 'hidden',
			value: 'false' as const,
		},
		{
			component: client.DynamicInertBooleanProperty,
			selector: '#dynamic-inert-boolean-property',
			name: 'inert',
			value: 'true' as const,
		},
	])(
		'warns for the ambiguous boolean string $value on a dynamic attribute',
		({ component, selector, name, value }) => {
			const error = captureErrors();
			const root = mount(component, { value });
			try {
				expect(root.find(selector).getAttribute(name)).toBe('');
				expectClientWarnings(error, [booleanStringWarning(name, value)]);
			} finally {
				root.unmount();
			}
		},
	);

	// Per ReactDOMComponent-test.js:3611,3629 — literal source must reach the
	// development validator without changing production template output.
	it.each([
		{
			component: client.StaticFalseBooleanProperty,
			selector: '#static-false-boolean-property',
			name: 'required',
			value: 'false' as const,
		},
		{
			component: client.StaticTrueBooleanProperty,
			selector: '#static-true-boolean-property',
			name: 'disabled',
			value: 'true' as const,
		},
	])(
		'warns for a statically authored boolean string $name=$value',
		({ component, selector, name, value }) => {
			const error = captureErrors();
			const root = mount(component);
			try {
				expect(root.find(selector).getAttribute(name)).toBe('');
				expectClientWarnings(error, [booleanStringWarning(name, value)]);
			} finally {
				root.unmount();
			}
		},
	);

	// Per ReactDOMComponent-test.js:192,206 — multiple function/symbol props
	// on one native host become one published plural diagnostic.
	it('groups multiple unsupported property values into one actionable client warning', () => {
		const error = captureErrors();
		const names = ['unsupportedclientfunction', 'unsupportedclientsymbol'];
		const root = mount(client.SpreadUnknownProperties, {
			attributes: { [names[0]]: () => {}, [names[1]]: Symbol('unsupported') },
		});
		try {
			const element = root.find('#unknown-properties');
			expect(element.hasAttribute(names[0])).toBe(false);
			expect(element.hasAttribute(names[1])).toBe(false);
			expectClientWarnings(error, [groupedInvalidWarning(names)]);
		} finally {
			root.unmount();
		}
	});

	// Per ReactDOMComponent-test.js:192 — singular invalid values retain the
	// existing actionable wording and do not emit a second grouped diagnostic.
	it('reports one unsupported host property value only once', () => {
		const error = captureErrors();
		const name = 'unsupportedclientsingle';
		const root = mount(client.SpreadUnknownProperties, {
			attributes: { [name]: Symbol('unsupported') },
		});
		try {
			expect(root.find('#unknown-properties').hasAttribute(name)).toBe(false);
			expectClientWarnings(error, [groupedInvalidWarning([name])]);
		} finally {
			root.unmount();
		}
	});

	// Per ReactDOMAttribute-test.js:203 — the browser keeps unknown custom
	// attributes, but HTML folds their names to lowercase.
	it('suggests lowercase spelling for an unknown camelCase host property', () => {
		const error = captureErrors();
		const name = 'mysteryClientProperty';
		const root = mount(client.SpreadUnknownProperties, { attributes: { [name]: 'visible' } });
		try {
			expect(root.find('#unknown-properties').getAttribute('mysteryclientproperty')).toBe(
				'visible',
			);
			expectClientWarnings(error, [unknownPropertyWarning(name)]);
		} finally {
			root.unmount();
		}
	});

	// Per ReactDOMAttribute-test.js:203 — static camelCase attributes must not
	// disappear into template HTML before their spelling can be validated.
	it('warns for an unknown statically authored camelCase host property', () => {
		const error = captureErrors();
		const root = mount(client.StaticUnknownCamelProperty);
		try {
			expect(
				root.find('#static-unknown-camel-property').getAttribute('mysterystaticproperty'),
			).toBe('visible');
			expectClientWarnings(error, [unknownPropertyWarning('mysteryStaticProperty')]);
		} finally {
			root.unmount();
		}
	});

	// Per ReactDOMComponent-test.js:3061 — known DOM property aliases point to
	// their supported authored spelling rather than generic custom-prop advice.
	it('suggests the supported spelling for a miscased known host property', () => {
		const error = captureErrors();
		const root = mount(client.SpreadUnknownProperties, { attributes: { tabindex: '2' } });
		try {
			expect(root.find('#unknown-properties').getAttribute('tabindex')).toBe('2');
			expectClientWarnings(error, ['Invalid DOM property `tabindex`. Did you mean `tabIndex`?']);
		} finally {
			root.unmount();
		}
	});

	// Per React's possibleStandardNames: supported input authoring remains quiet.
	it('accepts canonical input property spellings without unknown-property warnings', () => {
		const error = captureErrors();
		const root = mount(client.CanonicalInputProperties);
		try {
			const element = root.find('#canonical-input-properties') as HTMLInputElement;
			expect(element.maxLength).toBe(12);
			expect(element.getAttribute('inputmode')).toBe('numeric');
			expect(element.getAttribute('autocapitalize')).toBe('none');
			expect(element.getAttribute('autocorrect')).toBe('off');
			expect(messages(error)).toEqual([]);
		} finally {
			root.unmount();
		}
	});

	// Canonical JSX spellings are validated before their native HTML alias.
	it('accepts canonical tabIndex and htmlFor direct attributes without alias warnings', () => {
		const error = captureErrors();
		const root = mount(client.CanonicalAliasedProperties);
		try {
			const element = root.find('#canonical-aliased-properties');
			expect(element.getAttribute('tabindex')).toBe('-1');
			expect(element.getAttribute('for')).toBe('canonical-input');
			expect(messages(error)).toEqual([]);
		} finally {
			root.unmount();
		}
	});

	it('accepts canonical tabIndex and htmlFor through a final spread snapshot', () => {
		const error = captureErrors();
		const root = mount(client.SpreadUnknownProperties, {
			attributes: { tabIndex: -1, htmlFor: 'canonical-input' },
		});
		try {
			const element = root.find('#unknown-properties');
			expect(element.getAttribute('tabindex')).toBe('-1');
			expect(element.getAttribute('for')).toBe('canonical-input');
			expect(messages(error)).toEqual([]);
		} finally {
			root.unmount();
		}
	});

	// OCTANE DIVERGENCE: native label `for` is supported alongside React's htmlFor.
	it('accepts the authored native label for attribute without a spelling diagnostic', () => {
		const error = captureErrors();
		const root = mount(client.NativeLabelFor, { target: 'native-label-input' });
		try {
			expect(root.find('#native-label-for').getAttribute('for')).toBe('native-label-input');
			expect(messages(error)).toEqual([]);
		} finally {
			root.unmount();
		}
	});

	it('accepts a native label for attribute from a spread without a spelling diagnostic', () => {
		const error = captureErrors();
		const root = mount(client.SpreadLabelProperties, {
			attributes: { for: 'spread-label-input' },
		});
		try {
			expect(root.find('#spread-label-properties').getAttribute('for')).toBe('spread-label-input');
			expect(messages(error)).toEqual([]);
		} finally {
			root.unmount();
		}
	});

	it('preserves the authored lowercase for spelling diagnostic on a non-label host', () => {
		const error = captureErrors();
		const root = mount(client.SpreadUnknownProperties, {
			attributes: { for: 'authored-lowercase' },
		});
		try {
			expect(root.find('#unknown-properties').getAttribute('for')).toBe('authored-lowercase');
			expectClientWarnings(error, ['Invalid DOM property `for`. Did you mean `htmlFor`?']);
		} finally {
			root.unmount();
		}
	});

	// Per ReactDOMComponent-test.js:1861,1870 — bare innerHTML stays inert
	// instead of parsing markup, while the author receives the safe replacement.
	it.each([
		{ name: 'innerHTML', value: '<strong>unsafe</strong>' },
		{ name: 'innerhtml', value: '<em>unsafe</em>' },
	])('rejects direct raw HTML intent expressed as $name', ({ name, value }) => {
		const error = captureErrors();
		const root = mount(client.SpreadUnknownProperties, { attributes: { [name]: value } });
		try {
			const element = root.find('#unknown-properties');
			expect(element.innerHTML).toBe('');
			expect(element.getAttribute('innerhtml')).toBe(value);
			expectClientWarnings(error, [innerHtmlWarning()]);
		} finally {
			root.unmount();
		}
	});

	// Per ReactDOMComponent-test.js:1861 — static innerHTML remains an ordinary
	// escaped attribute while the DEV compiler preserves its diagnostic.
	it('warns for a statically authored reserved innerHTML property', () => {
		const error = captureErrors();
		const root = mount(client.StaticReservedInnerHtml);
		try {
			const element = root.find('#static-reserved-inner-html');
			expect(element.innerHTML).toBe('');
			expect(element.getAttribute('innerhtml')).toBe('<strong>not parsed</strong>');
			expectClientWarnings(error, [innerHtmlWarning()]);
		} finally {
			root.unmount();
		}
	});

	// Per ReactDOMComponent-test.js:1499 — customized built-in marker values
	// must be strings; null remains a valid absent value.
	it('warns when the customized-built-in is property is not a string', () => {
		const error = captureErrors();
		const root = mount(client.SpreadUnknownProperties, { attributes: { is: 42 } });
		try {
			expect(root.find('#unknown-properties').getAttribute('is')).toBe('42');
			expectClientWarnings(error, [nonStringIsWarning('number')]);
		} finally {
			root.unmount();
		}
	});

	// Per ReactDOMUnknownPropertyHook.js:371-374 — a string-valued is prop
	// identifies a customized built-in whose raw custom attributes stay quiet.
	it('keeps customized built-in attributes silent when is is a string', () => {
		const error = captureErrors();
		const root = mount(client.SpreadUnknownProperties, {
			attributes: { is: 'diagnostic-widget', customizedCamelCase: 'raw' },
		});
		try {
			const element = root.find('#unknown-properties');
			expect(element.getAttribute('is')).toBe('diagnostic-widget');
			expect(element.getAttribute('customizedcamelcase')).toBe('raw');
			expect(messages(error)).toEqual([]);
		} finally {
			root.unmount();
		}
	});

	// Per ReactDOMUnknownPropertyHook.js:371-374 — directly authored customized
	// built-ins use the final host props regardless of their source order.
	it.each([
		{
			name: 'is first',
			component: client.StaticCustomizedBuiltInIsFirst,
			selector: '#static-customized-built-in-is-first',
			attribute: 'customizedisfirstproperty',
		},
		{
			name: 'is last',
			component: client.StaticCustomizedBuiltInIsLast,
			selector: '#static-customized-built-in-is-last',
			attribute: 'customizedislastproperty',
		},
	])(
		'keeps directly authored customized built-in properties silent with $name',
		({ component, selector, attribute }) => {
			const error = captureErrors();
			const root = mount(component);
			try {
				const element = root.find(selector);
				expect(element.getAttribute('is')).toBe('diagnostic-widget');
				expect(element.getAttribute(attribute)).toBe('raw');
				expect(messages(error)).toEqual([]);
			} finally {
				root.unmount();
			}
		},
	);

	it('keeps directly authored customized properties silent for a dynamic string is', () => {
		const error = captureErrors();
		const root = mount(client.DynamicCustomizedBuiltIn, { kind: 'dynamic-widget' });
		try {
			const element = root.find('#dynamic-customized-built-in');
			expect(element.getAttribute('is')).toBe('dynamic-widget');
			expect(element.getAttribute('customizeddynamicproperty')).toBe('raw');
			expect(messages(error)).toEqual([]);
			root.update(client.DynamicCustomizedBuiltIn, { kind: 'updated-widget' });
			expect(root.find('#dynamic-customized-built-in')).toBe(element);
			expect(element.getAttribute('is')).toBe('updated-widget');
			expect(element.getAttribute('customizeddynamicproperty')).toBe('raw');
			expect(messages(error)).toEqual([]);
			root.update(client.DynamicCustomizedBuiltIn, { kind: null });
			expect(root.find('#dynamic-customized-built-in')).toBe(element);
			expect(element.hasAttribute('is')).toBe(false);
			expect(element.getAttribute('customizeddynamicproperty')).toBe('raw');
			expectClientWarnings(error, [unknownPropertyWarning('customizedDynamicProperty')]);
			error.mockClear();
			root.update(client.DynamicCustomizedBuiltIn, { kind: 'restored-widget' });
			expect(root.find('#dynamic-customized-built-in')).toBe(element);
			expect(element.getAttribute('is')).toBe('restored-widget');
			expect(element.getAttribute('customizeddynamicproperty')).toBe('raw');
			expect(messages(error)).toEqual([]);
		} finally {
			root.unmount();
		}
	});

	// Per ReactDOMComponent-test.js:1499 — only a string `is` opts a native
	// host out of normal property validation; null is simply an absent marker.
	it.each([
		{
			name: 'number',
			component: client.DynamicCustomizedBuiltInNumber,
			selector: '#dynamic-customized-built-in-number',
			attribute: 'customizedDynamicNumberProperty',
			kind: 123,
			serialized: '123',
			warnings: [unknownPropertyWarning('customizedDynamicNumberProperty')],
		},
		{
			name: 'null',
			component: client.DynamicCustomizedBuiltInNull,
			selector: '#dynamic-customized-built-in-null',
			attribute: 'customizedDynamicNullProperty',
			kind: null,
			serialized: null,
			warnings: [unknownPropertyWarning('customizedDynamicNullProperty')],
		},
	])(
		'validates directly authored host properties when a dynamic is marker is $name',
		({ component, selector, attribute, kind, serialized, warnings }) => {
			const error = captureErrors();
			const root = mount(component, { kind });
			try {
				const element = root.find(selector);
				expect(element.getAttribute('is')).toBe(serialized);
				expect(element.getAttribute(attribute.toLowerCase())).toBe('raw');
				expectClientWarnings(error, warnings);
			} finally {
				root.unmount();
			}
		},
	);

	// Per ReactDOMComponent-test.js:232,265 — lowercased event-shaped strings
	// never become inline script attributes and explain why they were dropped.
	it.each([
		{ name: 'onunknownclient', value: 'alert("unsafe")' },
		{ name: 'on-client-custom', value: 'alert("unsafe")' },
	])('warns and drops the unsupported event-shaped string $name', ({ name, value }) => {
		const error = captureErrors();
		const root = mount(client.SpreadUnknownProperties, { attributes: { [name]: value } });
		try {
			expect(root.find('#unknown-properties').hasAttribute(name)).toBe(false);
			expectClientWarnings(error, [unknownEventWarning(name)]);
		} finally {
			root.unmount();
		}
	});

	// Per ReactDOMComponent-test.js:594 — empty resource URLs reload the current
	// document; anchors deliberately retain their supported empty-href behavior.
	it('warns and omits an empty image source', () => {
		const error = captureErrors();
		const root = mount(client.DynamicImageSource, { value: '' });
		try {
			expect(root.find('#dynamic-image-source').hasAttribute('src')).toBe(false);
			expectClientWarnings(error, [emptyUrlWarning('src')]);
		} finally {
			root.unmount();
		}
	});

	// Per ReactDOMComponent-test.js:594 — compile-time empty URLs remain absent
	// while development output routes their published diagnostic.
	it('warns for a statically authored empty image source', () => {
		const error = captureErrors();
		const root = mount(client.StaticEmptyObjectData);
		try {
			expect(root.find('#static-empty-object-data').hasAttribute('data')).toBe(false);
			expectClientWarnings(error, [emptyUrlWarning('data')]);
		} finally {
			root.unmount();
		}
	});

	it('keeps valid empty anchor URLs silent', () => {
		const error = captureErrors();
		const root = mount(client.DynamicAnchorHref, { value: '' });
		try {
			expect(root.find('#dynamic-anchor-href').getAttribute('href')).toBe('');
			expect(messages(error)).toEqual([]);
		} finally {
			root.unmount();
		}
	});

	// Per ReactDOMUnknownPropertyHook.js:371-374 — custom hosts preserve raw
	// spelling and supported event semantics without native-host diagnostics.
	it('preserves custom-element raw attributes without native-host warnings', () => {
		const error = captureErrors();
		const root = mount(client.CustomUnknownProperties, {
			attributes: { customCamelCase: 'raw', innerHTML: 'inert', is: 12 },
		});
		try {
			const element = root.find('#custom-unknown-properties');
			expect(element.getAttribute('customcamelcase')).toBe('raw');
			expect(element.getAttribute('innerhtml')).toBe('inert');
			expect(element.getAttribute('is')).toBe('12');
			expect(messages(error)).toEqual([]);
		} finally {
			root.unmount();
		}
	});

	// Per ReactDOMUnknownPropertyHook.js:17-20 — module-level dedupe keys on
	// authored spelling, so independent roots report the same typo only once.
	it('deduplicates unknown-property guidance by authored spelling across roots', () => {
		const error = captureErrors();
		const name = 'dedupedUnknownClientName';
		const first = mount(client.SpreadUnknownProperties, { attributes: { [name]: 'first' } });
		const second = mount(client.SpreadUnknownProperties, { attributes: { [name]: 'second' } });
		try {
			expect(first.find('#unknown-properties').getAttribute(name.toLowerCase())).toBe('first');
			expect(second.find('#unknown-properties').getAttribute(name.toLowerCase())).toBe('second');
			expectClientWarnings(error, [unknownPropertyWarning(name)]);
		} finally {
			first.unmount();
			second.unmount();
		}
	});

	// Per ReactDOMUnknownPropertyHook.js:17-20 — dedupe belongs to authored
	// spellings rather than the lowercase HTML attribute they eventually share.
	it('keeps distinct authored spellings separate when they target one HTML attribute', () => {
		const error = captureErrors();
		const firstName = 'authoredClientName';
		const secondName = 'AuthoredClientName';
		const first = mount(client.SpreadUnknownProperties, {
			attributes: { [firstName]: 'first' },
		});
		const second = mount(client.SpreadUnknownProperties, {
			attributes: { [secondName]: 'second' },
		});
		try {
			expect(first.find('#unknown-properties').getAttribute('authoredclientname')).toBe('first');
			expect(second.find('#unknown-properties').getAttribute('authoredclientname')).toBe('second');
			expectClientWarnings(error, [
				unknownPropertyWarning(firstName),
				unknownPropertyWarning(secondName),
			]);
		} finally {
			first.unmount();
			second.unmount();
		}
	});

	// Per CheckStringCoercion.js:135 — validation observes the existing
	// serialization exactly once and never replaces the author's thrown error.
	it('coerces a successful effectful host attribute exactly once', () => {
		const error = captureErrors();
		let coercions = 0;
		const value = {
			toString() {
				coercions++;
				return 'coerced';
			},
		};
		const root = mount(client.SpreadUnknownProperties, {
			attributes: { successfulcoercion: value },
		});
		try {
			expect(root.find('#unknown-properties').getAttribute('successfulcoercion')).toBe('coerced');
			expect(coercions).toBe(1);
			expect(messages(error)).toEqual([]);
		} finally {
			root.unmount();
		}
	});

	it('preserves an unsupported host attribute coercion failure with actionable guidance', () => {
		class UnsupportedClientValue {
			toString(): string {
				throw new TypeError('client attribute coercion failed');
			}
		}
		const error = captureErrors();
		expect(() =>
			mount(client.SpreadUnknownProperties, {
				attributes: { failedclientcoercion: new UnsupportedClientValue() },
			}),
		).toThrow(new TypeError('client attribute coercion failed'));
		expectClientWarnings(error, [
			'The provided `failedclientcoercion` attribute is an unsupported type UnsupportedClientValue. ' +
				'Coerce it to a string before passing it to a DOM element.',
		]);
	});

	it('reads an effectful spread host property exactly once', () => {
		const error = captureErrors();
		let reads = 0;
		const root = mount(client.SpreadUnknownProperties, {
			attributes: {
				get effectfulClientProperty() {
					reads++;
					return 'visible';
				},
			},
		});
		try {
			expect(root.find('#unknown-properties').getAttribute('effectfulclientproperty')).toBe(
				'visible',
			);
			expect(reads).toBe(1);
			expectClientWarnings(error, [unknownPropertyWarning('effectfulClientProperty')]);
		} finally {
			root.unmount();
		}
	});
});

describe('server and hydration unknown-property diagnostics', () => {
	// Per ReactDOMComponent-test.js:206 — SSR final host snapshots aggregate
	// unsupported values once while preserving all remaining host attributes.
	it('groups multiple unsupported property values into one server warning', () => {
		const error = captureErrors();
		const names = ['unsupportedserverfunction', 'unsupportedserversymbol'];
		const html = Server.renderToString(devServer.SpreadUnknownProperties, {
			attributes: { [names[0]]: () => {}, [names[1]]: Symbol('unsupported') },
		}).html;
		expect(html).not.toContain(names[0]);
		expect(html).not.toContain(names[1]);
		expect(messages(error)).toEqual([groupedInvalidWarning(names)]);
	});

	// Per ReactDOMComponent-test.js:3084 — server-side spelling guidance uses
	// the authored name before HTML normalization or alias serialization.
	it('suggests lowercase spelling for an unknown server host property', () => {
		const error = captureErrors();
		const name = 'mysteryServerProperty';
		const html = Server.renderToStaticMarkup(devServer.SpreadUnknownProperties, {
			attributes: { [name]: 'visible' },
		}).html;
		expect(html).toContain(`${name}="visible"`);
		expect(messages(error)).toEqual([unknownPropertyWarning(name)]);
	});

	it('accepts canonical server input property spellings without diagnostics', () => {
		const error = captureErrors();
		const html = Server.renderToString(devServer.CanonicalInputProperties).html;
		expect(html.toLowerCase()).toContain('maxlength="12"');
		expect(html.toLowerCase()).toContain('inputmode="numeric"');
		expect(html.toLowerCase()).toContain('autocapitalize="none"');
		expect(html.toLowerCase()).toContain('autocorrect="off"');
		expect(messages(error)).toEqual([]);
	});

	it('accepts canonical server tabIndex and htmlFor direct attributes', () => {
		const error = captureErrors();
		const html = Server.renderToString(devServer.CanonicalAliasedProperties).html;
		expect(html).toContain('tabindex="-1"');
		expect(html).toContain('for="canonical-input"');
		expect(messages(error)).toEqual([]);
	});

	it('accepts canonical server tabIndex and htmlFor in a resolved spread', () => {
		const error = captureErrors();
		const html = Server.renderToString(devServer.SpreadUnknownProperties, {
			attributes: { tabIndex: -1, htmlFor: 'canonical-input' },
		}).html;
		expect(html).toContain('tabindex="-1"');
		expect(html).toContain('for="canonical-input"');
		expect(messages(error)).toEqual([]);
	});

	// OCTANE DIVERGENCE: native label `for` also stays silent during SSR.
	it('accepts an authored native server label for attribute without diagnostics', () => {
		const error = captureErrors();
		const direct = Server.renderToString(devServer.NativeLabelFor, {
			target: 'direct-native-input',
		}).html;
		const spread = Server.renderToString(devServer.SpreadLabelProperties, {
			attributes: { for: 'spread-native-input' },
		}).html;
		expect(direct).toContain('for="direct-native-input"');
		expect(spread).toContain('for="spread-native-input"');
		expect(messages(error)).toEqual([]);
	});

	it('preserves the lowercase for spelling diagnostic on a server non-label host', () => {
		const error = captureErrors();
		const html = Server.renderToString(devServer.SpreadUnknownProperties, {
			attributes: { for: 'server-non-label' },
		}).html;
		expect(html).toContain('for="server-non-label"');
		expect(messages(error)).toEqual(['Invalid DOM property `for`. Did you mean `htmlFor`?']);
	});

	// Per ReactDOMComponent-test.js:3611,3629 — server output writes boolean
	// presence while reporting its ambiguous string input.
	it('warns for an ambiguous boolean string while retaining server presence semantics', () => {
		const error = captureErrors();
		const html = Server.renderToString(devServer.StaticFalseBooleanProperty).html;
		expect(html).toContain('required=""');
		expect(messages(error)).toEqual([booleanStringWarning('required', 'false')]);
	});

	// Per ReactDOMComponent-test.js:1861,1870 — SSR escapes unsupported raw HTML
	// props instead of interpreting them as executable element contents.
	it('warns for direct innerHTML intent without injecting server markup', () => {
		const error = captureErrors();
		const html = Server.renderToString(devServer.SpreadUnknownProperties, {
			attributes: { innerhtml: '<script>unsafe()</script>' },
		}).html;
		const container = document.createElement('div');
		container.innerHTML = html;
		const element = container.querySelector('#unknown-properties');
		expect(element?.getAttribute('innerhtml')).toBe('<script>unsafe()</script>');
		expect(element?.querySelector('script')).toBeNull();
		expect(messages(error)).toEqual([innerHtmlWarning()]);
	});

	// Per ReactDOMComponent-test.js:1499 — SSR uses the same customized-host
	// string requirement and raw-attribute exception as the client.
	it('warns for a non-string server is attribute', () => {
		const error = captureErrors();
		const html = Server.renderToString(devServer.SpreadUnknownProperties, {
			attributes: { is: 123 },
		}).html;
		expect(html).toContain('is="123"');
		expect(messages(error)).toEqual([nonStringIsWarning('number')]);
	});

	it('keeps server customized built-in properties silent for string-valued is', () => {
		const error = captureErrors();
		const html = Server.renderToString(devServer.SpreadUnknownProperties, {
			attributes: { is: 'server-widget', customizedServerProperty: 'raw' },
		}).html;
		expect(html).toContain('is="server-widget"');
		expect(html).toContain('customizedServerProperty="raw"');
		expect(messages(error)).toEqual([]);
	});

	// Per ReactDOMUnknownPropertyHook.js:371-374 — SSR sees the same finalized
	// customized-built-in marker as client rendering for either author order.
	it.each([
		{
			name: 'is first',
			component: devServer.StaticCustomizedBuiltInIsFirst,
			attribute: 'customizedIsFirstProperty',
		},
		{
			name: 'is last',
			component: devServer.StaticCustomizedBuiltInIsLast,
			attribute: 'customizedIsLastProperty',
		},
	])(
		'keeps directly authored server customized built-in properties silent with $name',
		({ component, attribute }) => {
			const error = captureErrors();
			const html = Server.renderToString(component).html;
			expect(html).toContain('is="diagnostic-widget"');
			expect(html).toContain(`${attribute}="raw"`);
			expect(messages(error)).toEqual([]);
		},
	);

	it('keeps directly authored server customized properties silent for a dynamic string is', () => {
		const error = captureErrors();
		const html = Server.renderToString(devServer.DynamicCustomizedBuiltIn, {
			kind: 'dynamic-widget',
		}).html;
		expect(html).toContain('customizedDynamicProperty="raw"');
		expect(html).toContain('is="dynamic-widget"');
		expect(messages(error)).toEqual([]);
	});

	it.each([
		{
			name: 'number',
			component: devServer.DynamicCustomizedBuiltInNumber,
			attribute: 'customizedDynamicNumberProperty',
			kind: 123,
			warnings: [unknownPropertyWarning('customizedDynamicNumberProperty')],
		},
		{
			name: 'null',
			component: devServer.DynamicCustomizedBuiltInNull,
			attribute: 'customizedDynamicNullProperty',
			kind: null,
			warnings: [unknownPropertyWarning('customizedDynamicNullProperty')],
		},
	])(
		'validates directly authored server host properties when a dynamic is marker is $name',
		({ component, attribute, kind, warnings }) => {
			const error = captureErrors();
			const html = Server.renderToString(component, { kind }).html;
			expect(html).toContain(`${attribute}="raw"`);
			if (kind === null) expect(html).not.toContain(' is=');
			else expect(html).toContain(`is="${kind}"`);
			expect(messages(error)).toEqual(warnings);
		},
	);

	// Per ReactDOMComponent-test.js:232,2681 — server filtering excludes event
	// strings from serialized HTML and explains incorrect event naming.
	it('warns and drops an unsupported event-shaped server property', () => {
		const error = captureErrors();
		const name = 'onunknownserver';
		const html = Server.renderToString(devServer.SpreadUnknownProperties, {
			attributes: { [name]: 'alert("unsafe")' },
		}).html;
		expect(html).not.toContain(name);
		expect(messages(error)).toEqual([unknownEventWarning(name)]);
	});

	// Per ReactDOMComponent-test.js:594 — empty server resource URLs are omitted
	// and carry the same actionable diagnostic as dynamic client rendering.
	it('warns and omits an empty server image source', () => {
		const error = captureErrors();
		const html = Server.renderToString(devServer.DynamicImageSource, { value: '' }).html;
		expect(html).not.toContain(' src=');
		expect(messages(error)).toEqual([emptyUrlWarning('src')]);
	});

	it('warns and omits a statically authored empty server image source', () => {
		const error = captureErrors();
		const html = Server.renderToString(devServer.StaticEmptyObjectData).html;
		expect(html).not.toContain(' data=');
		expect(messages(error)).toEqual([emptyUrlWarning('data')]);
	});

	// Per ReactDOMComponent-test.js:206 — public descriptor rendering uses the
	// same final host-prop snapshot rather than separate per-value warnings.
	it('groups unsupported values on public server element descriptors', () => {
		const error = captureErrors();
		const names = ['unsupporteddescriptorone', 'unsupporteddescriptortwo'];
		const Descriptor = () =>
			Server.createElement('div', {
				[names[0]]: () => {},
				[names[1]]: Symbol('unsupported'),
			});
		const html = Server.renderToString(Descriptor).html;
		expect(html).toContain('<div');
		expect(messages(error)).toEqual([groupedInvalidWarning(names)]);
	});

	// Per ReactFizzConfigDOM.js host validation — both stream APIs publish the
	// same property diagnostic without turning it into a stream failure.
	it.each([
		{ name: 'pipeable', render: collectPipeableStream, property: 'pipeableMysteryProperty' },
		{ name: 'readable', render: collectReadableStream, property: 'readableMysteryProperty' },
	])(
		'reports unknown host properties through $name streaming output',
		async ({ render, property }) => {
			const error = captureErrors();
			const result = await render(devServer.SpreadUnknownProperties, {
				attributes: { [property]: 'stream' },
			});
			expect(result.errors).toEqual([]);
			expect(result.html).toContain(`${property}="stream"`);
			expect(messages(error)).toEqual([unknownPropertyWarning(property)]);
		},
	);

	// Per ReactDOMUnknownPropertyHook.js:371-374 — custom HTML hosts retain
	// their raw server attributes and never inherit native-property validation.
	it('keeps server custom-element host attributes silent', () => {
		const error = captureErrors();
		const html = Server.renderToString(devServer.CustomUnknownProperties, {
			attributes: { serverCustomProperty: 'raw', innerHTML: 'inert', is: 456 },
		}).html;
		expect(html).toContain('serverCustomProperty="raw"');
		expect(html).toContain('innerHTML="inert"');
		expect(html).toContain('is="456"');
		expect(messages(error)).toEqual([]);
	});

	// Per ReactDOMUnknownPropertyHook.js:17-20 — warning state is owned by the
	// server renderer module and keyed by each authored property spelling.
	it('deduplicates unknown server properties across independent renders', () => {
		const error = captureErrors();
		const name = 'dedupedUnknownServerName';
		const props = { attributes: { [name]: 'visible' } };
		Server.renderToString(devServer.SpreadUnknownProperties, props);
		Server.renderToString(devServer.SpreadUnknownProperties, props);
		expect(messages(error)).toEqual([unknownPropertyWarning(name)]);
	});

	it('coerces a successful effectful server host attribute exactly once', () => {
		const error = captureErrors();
		let coercions = 0;
		const value = {
			toString() {
				coercions++;
				return 'coerced';
			},
		};
		const html = Server.renderToString(devServer.SpreadUnknownProperties, {
			attributes: { successfulservercoercion: value },
		}).html;
		expect(html).toContain('successfulservercoercion="coerced"');
		expect(coercions).toBe(1);
		expect(messages(error)).toEqual([]);
	});

	it('preserves an unsupported server host attribute coercion failure', () => {
		class UnsupportedServerValue {
			toString(): string {
				throw new TypeError('server attribute coercion failed');
			}
		}
		const error = captureErrors();
		expect(() =>
			Server.renderToString(devServer.SpreadUnknownProperties, {
				attributes: { failedservercoercion: new UnsupportedServerValue() },
			}),
		).toThrow(new TypeError('server attribute coercion failed'));
		expect(messages(error)).toEqual([
			'The provided `failedservercoercion` attribute is an unsupported type UnsupportedServerValue. ' +
				'Coerce it to a string before passing it to a DOM element.',
		]);
	});

	it('reads an effectful server spread host property exactly once', () => {
		const error = captureErrors();
		let reads = 0;
		const html = Server.renderToString(devServer.SpreadUnknownProperties, {
			attributes: {
				get effectfulServerProperty() {
					reads++;
					return 'visible';
				},
			},
		}).html;
		expect(html).toContain('effectfulServerProperty="visible"');
		expect(reads).toBe(1);
		expect(messages(error)).toEqual([unknownPropertyWarning('effectfulServerProperty')]);
	});

	// Per ReactDOMComponent-test.js:192 — hydration retains the existing server
	// element while each renderer independently validates the same authored prop.
	it('reports unknown host properties during matching hydration without replacing DOM', () => {
		const name = 'hydratedMysteryProperty';
		const attributes = { [name]: 'hydrated' };
		const error = captureErrors();
		const html = Server.renderToString(devServer.SpreadUnknownProperties, { attributes }).html;
		const container = document.createElement('div');
		container.innerHTML = html;
		const original = container.querySelector('#unknown-properties');
		error.mockClear();
		const root = hydrateRoot(container, client.SpreadUnknownProperties, { attributes });
		try {
			flushSync(() => {});
			expect(container.querySelector('#unknown-properties')).toBe(original);
			expectClientWarnings(error, [unknownPropertyWarning(name)]);
		} finally {
			root.unmount();
		}
	});

	// Per ReactDOMUnknownPropertyHook.js:371-374 — customized-built-in hydration
	// adopts existing server HTML without reporting its authored raw properties.
	it('adopts a directly authored customized built-in without unknown-property warnings', () => {
		const error = captureErrors();
		const html = Server.renderToString(devServer.HydratedCustomizedBuiltIn).html;
		const container = document.createElement('div');
		container.innerHTML = html;
		const original = container.querySelector('#hydrated-customized-built-in');
		expect(original?.getAttribute('is')).toBe('hydrated-widget');
		expect(original?.getAttribute('customizedhydrationproperty')).toBe('raw');
		expect(messages(error)).toEqual([]);
		error.mockClear();
		const root = hydrateRoot(container, client.HydratedCustomizedBuiltIn);
		try {
			flushSync(() => {});
			expect(container.querySelector('#hydrated-customized-built-in')).toBe(original);
			expect(messages(error)).toEqual([]);
		} finally {
			root.unmount();
		}
	});

	// Per ReactDOMUnknownPropertyHook.js __DEV__ guards — production rendering
	// keeps identical host serialization while removing every diagnostic path.
	it('keeps production server host-property validation silent', () => {
		const error = captureErrors();
		const originalEnvironment = process.env.NODE_ENV;
		process.env.NODE_ENV = 'production';
		try {
			const html = Server.renderToString(prodServer.SpreadUnknownProperties, {
				attributes: {
					productionMysteryProperty: 'visible',
					innerhtml: 'inert',
					is: 999,
				},
			}).html;
			expect(html).toContain('productionMysteryProperty="visible"');
			expect(html).toContain('innerhtml="inert"');
			expect(html).toContain('is="999"');
		} finally {
			if (originalEnvironment === undefined) delete process.env.NODE_ENV;
			else process.env.NODE_ENV = originalEnvironment;
		}
		expect(messages(error)).toEqual([]);
	});
});
