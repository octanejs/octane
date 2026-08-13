import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement, flushSync, hydrateRoot } from 'octane';
import * as Server from 'octane/server';
import { mount } from '../_helpers.js';
import { loadServerFixture } from '../_server-fixture.js';
import { collectPipeableStream, collectReadableStream } from '../_server-stream.js';
import * as client from './_fixtures/form-diagnostics.tsrx';

const PROD_COMPILE = process.env.OCTANE_TEST_COMPILE_MODE === 'prod';
const FIXTURE = 'packages/octane/tests/conformance/_fixtures/form-diagnostics.tsrx';
const server = loadServerFixture<typeof client>(FIXTURE, {
	compileOptions: { dev: !PROD_COMPILE },
});

function errorMessages(spy: ReturnType<typeof vi.spyOn>): string[] {
	return spy.mock.calls.map((call) => call.map(String).join(' '));
}

function expectWarnings(spy: ReturnType<typeof vi.spyOn>, fragments: string[]): void {
	const messages = errorMessages(spy);
	if (PROD_COMPILE) {
		expect(messages).toEqual([]);
		return;
	}
	expect(messages).toHaveLength(fragments.length);
	for (const [index, fragment] of fragments.entries()) {
		expect(messages[index]).toContain(fragment);
	}
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('controlled/default form prop conflicts', () => {
	// Per ReactDOMInput-test.js:2063: readOnly suppresses missing-handler
	// guidance, but never suppresses contradictory controlled/default writers.
	it('warns when an input has both value and defaultValue', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const rendered = mount(client.ConflictingInput, { value: 'first', defaultValue: 'second' });
		try {
			expect((rendered.find('#form-conflict-input') as HTMLInputElement).value).toBe('first');
			expectWarnings(error, ['both `value` and `defaultValue`']);
		} finally {
			rendered.unmount();
		}
	});

	// Per ReactDOMInput-test.js:2028: checked={false} remains a present
	// controlled writer and must not disappear behind truthiness checks.
	it.each([
		{ type: 'checkbox', checked: false },
		{ type: 'radio', checked: true },
	])('warns when a $type has both checked and defaultChecked', ({ type, checked }) => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const rendered = mount(client.ConflictingCheckbox, {
			type,
			checked,
			defaultChecked: true,
		});
		try {
			expect((rendered.find('#form-conflict-checkbox') as HTMLInputElement).checked).toBe(checked);
			expectWarnings(error, ['both `checked` and `defaultChecked`']);
		} finally {
			rendered.unmount();
		}
	});

	// Per ReactDOMTextarea-test.js:730 and ReactDOMSelect-test.js:864.
	it.each([
		{
			tag: 'textarea',
			component: client.ConflictingTextarea,
			selector: '#form-conflict-textarea',
			value: 'first',
			defaultValue: 'second',
		},
		{
			tag: 'select',
			component: client.ConflictingSelect,
			selector: '#form-conflict-select',
			value: 'first',
			defaultValue: 'second',
		},
	])('warns when a $tag has both value and defaultValue', (testCase) => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const rendered = mount(testCase.component, {
			value: testCase.value,
			defaultValue: testCase.defaultValue,
		});
		try {
			expect((rendered.find(testCase.selector) as HTMLInputElement).value).toBe(testCase.value);
			expectWarnings(error, ['both `value` and `defaultValue`']);
			if (!PROD_COMPILE) expect(errorMessages(error)[0]).toContain(`<${testCase.tag}>`);
		} finally {
			rendered.unmount();
		}
	});

	// Per ReactDOMInput.js:47-84: JSX spreads are evaluated once before the
	// final effective controlled/default writer set is validated.
	it('validates the final spread writers without rereading getters', () => {
		let reads = 0;
		const attributes = {
			get value() {
				reads++;
				return 'controlled';
			},
			defaultValue: 'default',
		};
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const rendered = mount(client.SpreadInput, { attributes });
		try {
			expect(reads).toBe(1);
			expect((rendered.find('#form-conflict-spread') as HTMLInputElement).value).toBe('controlled');
			expectWarnings(error, ['both `value` and `defaultValue`']);
		} finally {
			rendered.unmount();
		}
	});

	// Per ReactDOMInput.js:53,70: undefined means an omitted writer; null is
	// present and contradictory when its paired default writer is defined.
	it.each([
		{ value: undefined, defaultValue: 'default' },
		{ value: 'controlled', defaultValue: undefined },
	])('keeps a missing paired writer silent', ({ value, defaultValue }) => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const rendered = mount(client.ConflictingInput, { value, defaultValue });
		try {
			expect(errorMessages(error)).toEqual([]);
		} finally {
			rendered.unmount();
		}
	});

	// Per ReactDOMInput.js:27-84: repeated commits of the same invalid element
	// do not publish the same authoring warning again.
	it('deduplicates the same conflict across component updates', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const rendered = mount(client.ConflictingInput, { value: 'first', defaultValue: 'second' });
		try {
			rendered.update(client.ConflictingInput, { value: 'updated', defaultValue: 'another' });
			expect((rendered.find('#form-conflict-input') as HTMLInputElement).value).toBe('updated');
			expectWarnings(error, ['both `value` and `defaultValue`']);
		} finally {
			rendered.unmount();
		}
	});
});

describe('option and textarea child diagnostics', () => {
	// Per ReactDOMSelect-test.js:778 and ReactDOMOption.js:55-60.
	it.each([
		{ name: 'dynamic', component: client.SelectedOption, props: { selected: true } },
		{ name: 'static', component: client.StaticSelectedOption, props: {} },
	])('warns for a $name selected prop on option', ({ component, props }) => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const rendered = mount(component, props);
		try {
			expect(rendered.container.querySelector('option')?.selected).toBe(true);
			expectWarnings(error, ['`value` or `defaultValue` on <select>']);
		} finally {
			rendered.unmount();
		}
	});

	// Per ReactDOMOption.js:55, only a non-null selected writer is authored.
	it.each([undefined, null])('keeps selected={%s} silent on the client', (selected) => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const rendered = mount(client.SelectedOption, { selected });
		try {
			expect(rendered.container.querySelectorAll('option')).toHaveLength(2);
			expect(errorMessages(error)).toEqual([]);
		} finally {
			rendered.unmount();
		}
	});

	// Per ReactDOMTextarea.js:55-58 and ReactDOMTextarea-test.js:481.
	it('recommends defaultValue instead of textarea text children', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const rendered = mount(client.TextareaChildren, { children: 'initial text' });
		try {
			expect((rendered.find('#form-textarea-children') as HTMLTextAreaElement).value).toBe(
				'initial text',
			);
			expectWarnings(error, ['`defaultValue` or `value` instead of children on <textarea>']);
		} finally {
			rendered.unmount();
		}
	});

	// Per ReactDOMOption-test.js:68,87: non-text/component children cannot
	// infer a stable option value; an explicit value makes the same child safe.
	it('warns for complex option children without an explicit value', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const rendered = mount(client.ComplexOptionChildren, { label: 'complex' });
		try {
			expect(rendered.container.querySelector('option')?.textContent).toBe('complex');
			expectWarnings(error, ['Cannot infer an <option> value from complex children']);
		} finally {
			rendered.unmount();
		}
	});

	it('keeps complex option children with an explicit value silent', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const rendered = mount(client.ValuedComplexOptionChildren, { label: 'complex' });
		try {
			expect((rendered.container.querySelector('option') as HTMLOptionElement).value).toBe(
				'explicit',
			);
			expect(errorMessages(error)).toEqual([]);
		} finally {
			rendered.unmount();
		}
	});
});

describe('function form-action diagnostics', () => {
	// Per ReactDOMComponent.js:117-201: function actions own their submission
	// transport and cannot honor contradictory native method/encoding/targets.
	it('warns when a function form action also declares method or encoding', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const action = () => {};
		const rendered = mount(client.FunctionActionForm, { action, method: 'get' });
		try {
			expect(rendered.find('#form-function-action').getAttribute('method')).toBe('get');
			expectWarnings(error, ['function form action cannot specify `method` or `encType`']);
		} finally {
			rendered.unmount();
		}
	});

	it('warns when a function form action also declares a navigation target', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const rendered = mount(client.FunctionActionForm, { action: () => {}, target: '_blank' });
		try {
			expectWarnings(error, ['function form action cannot specify `target`']);
		} finally {
			rendered.unmount();
		}
	});

	it('warns for conflicting submitter name, method, and target props', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const rendered = mount(client.FunctionActionButton, {
			type: 'submit',
			action: () => {},
			name: 'submitter',
			formMethod: 'get',
			formTarget: '_blank',
		});
		try {
			expectWarnings(error, [
				'function `formAction` cannot specify `name`',
				'function `formAction` cannot specify `formMethod` or `formEncType`',
				'function `formAction` cannot specify `formTarget`',
			]);
		} finally {
			rendered.unmount();
		}
	});

	it.each([
		{ name: 'input', component: client.FunctionActionInput, type: 'text' },
		{ name: 'button', component: client.FunctionActionButton, type: 'button' },
	])('warns when a $name formAction cannot submit a form', ({ name, component, type }) => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const rendered = mount(component, { type, action: () => {} });
		try {
			expectWarnings(error, ['<' + name + '> can only specify `formAction`']);
		} finally {
			rendered.unmount();
		}
	});

	it('keeps native string actions and supported function actions silent', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const native = mount(client.FunctionActionForm, {
			action: '/submit',
			method: 'post',
			target: '_self',
		});
		const functional = mount(client.FunctionActionButton, { type: 'submit', action: () => {} });
		try {
			expect(errorMessages(error)).toEqual([]);
		} finally {
			native.unmount();
			functional.unmount();
		}
	});

	it('keeps a function action on a statically typed submit input silent', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const rendered = mount(client.StaticFunctionActionInput, { action: () => {} });
		try {
			expect((rendered.find('#form-static-function-input') as HTMLInputElement).type).toBe(
				'submit',
			);
			expect(errorMessages(error)).toEqual([]);
		} finally {
			rendered.unmount();
		}
	});

	it('validates spread-only function actions without rereading getters', () => {
		let reads = 0;
		const attributes = {
			get action() {
				reads++;
				return () => {};
			},
			method: 'post',
			target: '_blank',
		};
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const rendered = mount(client.SpreadFunctionActionForm, { attributes });
		try {
			expect(reads).toBe(1);
			expectWarnings(error, [
				'function form action cannot specify `method` or `encType`',
				'function form action cannot specify `target`',
			]);
		} finally {
			rendered.unmount();
		}
	});
});

describe('server form diagnostics', () => {
	// Per ReactFizzConfigDOM.js form validation: buffered/static rendering
	// reports the same final source-set conflict without changing its HTML.
	it.each([
		{
			tag: 'input',
			component: server.ConflictingInput,
			props: { value: 'first', defaultValue: 'second' },
			fragment: 'value="first"',
			warning: 'both `value` and `defaultValue`',
		},
		{
			tag: 'checkbox',
			component: server.ConflictingCheckbox,
			props: { checked: true, defaultChecked: false },
			fragment: 'checked',
			warning: 'both `checked` and `defaultChecked`',
		},
		{
			tag: 'textarea',
			component: server.ConflictingTextarea,
			props: { value: 'first', defaultValue: 'second' },
			fragment: '>first</textarea>',
			warning: 'both `value` and `defaultValue`',
		},
		{
			tag: 'select',
			component: server.ConflictingSelect,
			props: { value: 'first', defaultValue: 'second' },
			fragment: 'selected',
			warning: 'both `value` and `defaultValue`',
		},
	])(
		'warns for conflicting $tag values during buffered SSR',
		({ component, props, fragment, warning }) => {
			const error = vi.spyOn(console, 'error').mockImplementation(() => {});
			const html = Server.renderToString(component, props).html;
			expect(html).toContain(fragment);
			expectWarnings(error, [warning]);
		},
	);

	it('validates final spread-provided textarea and select props during SSR', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const textarea = Server.renderToStaticMarkup(server.SpreadTextarea, {
			attributes: { value: 'controlled', defaultValue: 'default' },
		}).html;
		const select = Server.renderToStaticMarkup(server.SpreadSelect, {
			attributes: { value: 'first', defaultValue: 'second' },
		}).html;
		expect(textarea).toContain('>controlled</textarea>');
		expect(select).toContain('selected');
		expectWarnings(error, ['both `value` and `defaultValue`', 'both `value` and `defaultValue`']);
	});

	it('reports function-action conflicts during server rendering', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const html = Server.renderToString(server.FunctionActionForm, {
			action: () => {},
			method: 'get',
			target: '_blank',
		}).html;
		expect(html).toContain('method="get"');
		expectWarnings(error, [
			'function form action cannot specify `method` or `encType`',
			'function form action cannot specify `target`',
		]);
	});

	it('reports selected option authoring during server rendering', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const html = Server.renderToString(server.SelectedOption, { selected: true }).html;
		expect(html).toContain('selected');
		expectWarnings(error, ['`value` or `defaultValue` on <select>']);
	});

	it.each([undefined, null])('keeps selected={%s} silent during SSR', (selected) => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const html = Server.renderToString(server.SelectedOption, { selected }).html;
		expect(html).toContain('<option value="first">');
		expect(errorMessages(error)).toEqual([]);
	});

	it('reports statically authored function-action transport conflicts during SSR', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const html = Server.renderToString(server.StaticFunctionActionForm, { action: () => {} }).html;
		expect(html).toContain('method="post"');
		expect(html).toContain('target="_blank"');
		expectWarnings(error, [
			'function form action cannot specify `method` or `encType`',
			'function form action cannot specify `target`',
		]);
	});

	it('keeps a statically typed function-action submit input silent during SSR', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const html = Server.renderToString(server.StaticFunctionActionInput, { action: () => {} }).html;
		expect(html).toContain('type="submit"');
		expect(errorMessages(error)).toEqual([]);
	});

	it('validates spread-only function actions during SSR without rereading getters', () => {
		let reads = 0;
		const attributes = {
			get action() {
				reads++;
				return () => {};
			},
			method: 'post',
			target: '_blank',
		};
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const html = Server.renderToString(server.SpreadFunctionActionForm, { attributes }).html;
		expect(reads).toBe(1);
		expect(html).toContain('method="post"');
		expectWarnings(error, [
			'function form action cannot specify `method` or `encType`',
			'function form action cannot specify `target`',
		]);
	});

	it('keeps a spread-only function-action submit input silent during SSR', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const html = Server.renderToString(server.SpreadFunctionActionInput, {
			attributes: { type: 'submit', formAction: () => {} },
		}).html;
		expect(html).toContain('type="submit"');
		expect(errorMessages(error)).toEqual([]);
	});

	it.each([
		{ name: 'pipeable', render: collectPipeableStream },
		{ name: 'readable', render: collectReadableStream },
	])('preserves form diagnostics in $name streaming output', async ({ render }) => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const result = await render(server.ConflictingInput, {
			value: 'streamed',
			defaultValue: 'fallback',
		});
		expect(result.html).toContain('value="streamed"');
		expect(result.errors).toEqual([]);
		expectWarnings(error, ['both `value` and `defaultValue`']);
	});

	it('warns for public server host descriptors with conflicting form props', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const Descriptor = () =>
			Server.createElement('input', {
				value: 'descriptor',
				defaultValue: 'fallback',
				readOnly: true,
			});
		const html = Server.renderToString(Descriptor).html;
		expect(html).toContain('value="descriptor"');
		expect(errorMessages(error)).toHaveLength(1);
		expect(errorMessages(error)[0]).toContain('both `value` and `defaultValue`');
	});

	it('keeps production-runtime descriptors and compiled hosts silent', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const originalNodeEnv = process.env.NODE_ENV;
		process.env.NODE_ENV = 'production';
		try {
			const Descriptor = () =>
				Server.createElement('input', {
					value: 'descriptor',
					defaultValue: 'fallback',
					readOnly: true,
				});
			expect(Server.renderToString(Descriptor).html).toContain('value="descriptor"');
			expect(
				Server.renderToString(server.ConflictingInput, {
					value: 'compiled',
					defaultValue: 'fallback',
				}).html,
			).toContain('value="compiled"');
		} finally {
			if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
			else process.env.NODE_ENV = originalNodeEnv;
		}
		expect(errorMessages(error)).toEqual([]);
	});

	it('adopts matching markup while reporting the client-side conflict', () => {
		const props = { value: 'hydrated', defaultValue: 'fallback' };
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const html = Server.renderToString(server.ConflictingInput, props).html;
		const container = document.createElement('div');
		container.innerHTML = html;
		const original = container.querySelector('#form-conflict-input');
		error.mockClear();
		const root = hydrateRoot(container, client.ConflictingInput, props);
		try {
			flushSync(() => {});
			expect(container.querySelector('#form-conflict-input')).toBe(original);
			expectWarnings(error, ['both `value` and `defaultValue`']);
		} finally {
			root.unmount();
		}
	});
});
