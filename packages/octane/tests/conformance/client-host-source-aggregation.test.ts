import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'octane';
import { mount } from '../_helpers.js';
import {
	AliasApplicationOrder,
	DangerToSpreadChild,
	DuplicateHostSources,
	DynamicVoidChild,
	FormSpreadEvaluationOrder,
	HostApplicationOrder,
	InputDefaultValueOrder,
	InputValueDefaultOrder,
	MutableFormSpreads,
	MutableHostCollision,
	NullishFormCascades,
	PropChildrenSources,
	SpreadSelect,
} from './_fixtures/client-host-source-aggregation.tsrx';

afterEach(() => {
	vi.restoreAllMocks();
});

const selected = (select: HTMLSelectElement) =>
	Array.from(select.selectedOptions, (option) => option.value);

describe('conformance: final host props across JSX sources', () => {
	// Per ReactDOMServerIntegrationInput-test.js:84,
	// ReactDOMServerIntegrationCheckbox-test.js:88, and
	// ReactDOMServerIntegrationTextarea-test.js:80-105. The final merged props
	// are resolved before the noncommutative controlled/default cascade runs.
	it('lets nullish controlled writers fall through to final defaults', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const props = {
			input: { value: null, defaultValue: 'input-default' },
			textarea: { value: null, defaultValue: 'textarea-default' },
			checkbox: { checked: null, defaultChecked: false },
		};
		const result = mount(NullishFormCascades, props);
		try {
			const input = result.find('#nullish-input') as HTMLInputElement;
			const textarea = result.find('#nullish-textarea') as HTMLTextAreaElement;
			const checkbox = result.find('#nullish-checkbox') as HTMLInputElement;
			expect(input.value).toBe('input-default');
			expect(input.defaultValue).toBe('input-default');
			expect(input.getAttribute('value')).toBe('input-default');
			expect(textarea.value).toBe('textarea-default');
			expect(textarea.defaultValue).toBe('textarea-default');
			expect(textarea.textContent).toBe('textarea-default');
			expect(checkbox.checked).toBe(false);
			expect(checkbox.defaultChecked).toBe(false);
			expect(checkbox.hasAttribute('checked')).toBe(false);

			// A controlled value owns textarea's baseline on every later commit;
			// defaultValue must not replace textContent after the first render.
			const controlled = {
				...props,
				textarea: { value: 'controlled', defaultValue: 'ignored-default' },
			};
			result.update(NullishFormCascades, controlled);
			result.update(NullishFormCascades, controlled);
			expect(textarea.value).toBe('controlled');
			expect(textarea.defaultValue).toBe('controlled');
			expect(textarea.textContent).toBe('controlled');
		} finally {
			result.unmount();
		}
	});

	// Per ReactDOMInput-test.js initInput coercion cases. The default is
	// normalized before the controlled value regardless of JSX authoring order,
	// while the controlled value still owns the final property and baseline.
	it('coerces input defaultValue before value in both authored orders', () => {
		for (const Component of [InputDefaultValueOrder, InputValueDefaultOrder]) {
			const log: string[] = [];
			const asValue = (label: string) => ({
				toString() {
					log.push(label);
					return label;
				},
			});
			const result = mount(Component, {
				defaultValue: asValue('default'),
				value: asValue('value'),
			});
			try {
				expect(log).toEqual(['default', 'value']);
				const input = result.container.firstElementChild as HTMLInputElement;
				expect(input.value).toBe('value');
				expect(input.defaultValue).toBe('value');
			} finally {
				result.unmount();
			}
		}
	});

	// Per ReactDOMSelect-test.js:174. `multiple` determines how `value` is
	// interpreted even when the spread's own key order presents value first.
	it('projects a reverse-key-order array value onto a multiple select', () => {
		const result = mount(SpreadSelect, {
			select: { value: ['bar', 'baz'], multiple: true },
		});
		try {
			const select = result.find('#spread-select') as HTMLSelectElement;
			expect(select.multiple).toBe(true);
			expect(select.getAttribute('multiple')).toBe('');
			expect(selected(select)).toEqual(['bar', 'baz']);
		} finally {
			result.unmount();
		}
	});

	// Per ReactDOMInput-test.js:1355 and ReactDOMSelect-test.js:174. Controlled
	// props reassert on every commit; removing them hands the current live state
	// to the browser, and adding them later takes ownership again.
	it('reasserts, removes, and restores spread-held controlled props', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const controlled = {
			input: { value: 'locked' },
			textarea: { value: 'locked' },
			checkbox: { checked: true },
			select: { value: ['bar', 'baz'], multiple: true },
		};
		const result = mount(MutableFormSpreads, controlled);
		try {
			const input = result.find('#mutable-input') as HTMLInputElement;
			const textarea = result.find('#mutable-textarea') as HTMLTextAreaElement;
			const checkbox = result.find('#mutable-checkbox') as HTMLInputElement;
			const select = result.find('#mutable-select') as HTMLSelectElement;

			input.value = 'drift';
			textarea.value = 'drift';
			checkbox.checked = false;
			select.multiple = false;
			select.value = 'foo';
			result.update(MutableFormSpreads, {
				input: { value: 'locked' },
				textarea: { value: 'locked' },
				checkbox: { checked: true },
				select: { value: ['bar', 'baz'], multiple: true },
			});
			expect(input.value).toBe('locked');
			expect(textarea.value).toBe('locked');
			expect(checkbox.checked).toBe(true);
			expect(select.multiple).toBe(true);
			expect(selected(select)).toEqual(['bar', 'baz']);

			const uncontrolled = { input: {}, textarea: {}, checkbox: {}, select: {} };
			result.update(MutableFormSpreads, uncontrolled);
			expect(input.value).toBe('locked');
			expect(textarea.value).toBe('locked');
			expect(checkbox.checked).toBe(true);
			expect(select.multiple).toBe(false);
			expect(select.value).toBe('foo');

			input.value = 'free';
			textarea.value = 'free';
			checkbox.checked = false;
			select.value = 'baz';
			result.update(MutableFormSpreads, uncontrolled);
			expect(input.value).toBe('free');
			expect(textarea.value).toBe('free');
			expect(checkbox.checked).toBe(false);
			expect(select.value).toBe('baz');

			result.update(MutableFormSpreads, controlled);
			expect(input.value).toBe('locked');
			expect(textarea.value).toBe('locked');
			expect(checkbox.checked).toBe(true);
			expect(select.multiple).toBe(true);
			expect(selected(select)).toEqual(['bar', 'baz']);
		} finally {
			result.unmount();
		}
	});

	// Per ReactDOMInput-test.js:1035 and ReactDOMTextarea-test.js:186. Removing
	// defaults clears the reset baseline without overwriting a dirty live value.
	it('removes spread defaults without clobbering user edits', () => {
		const result = mount(MutableFormSpreads, {
			input: { defaultValue: 'seed' },
			textarea: { defaultValue: 'seed' },
			checkbox: { defaultChecked: true },
			select: {},
		});
		try {
			const input = result.find('#mutable-input') as HTMLInputElement;
			const textarea = result.find('#mutable-textarea') as HTMLTextAreaElement;
			const checkbox = result.find('#mutable-checkbox') as HTMLInputElement;
			input.value = 'typed';
			textarea.value = 'typed';
			checkbox.checked = false;
			result.update(MutableFormSpreads, {
				input: {},
				textarea: {},
				checkbox: {},
				select: {},
			});
			expect(input.value).toBe('typed');
			expect(input.defaultValue).toBe('');
			expect(input.hasAttribute('value')).toBe(false);
			expect(textarea.value).toBe('typed');
			expect(textarea.defaultValue).toBe('');
			expect(textarea.textContent).toBe('');
			expect(checkbox.checked).toBe(false);
			expect(checkbox.defaultChecked).toBe(false);
			expect(checkbox.hasAttribute('checked')).toBe(false);
		} finally {
			result.unmount();
		}
	});

	// Per ReactJSXTransformIntegration-test.js:95. Every enumerable spread
	// getter, including a symbol getter that cannot become a DOM prop, runs once
	// at the spread's authored position.
	it('evaluates direct, string-key, and symbol-key sources exactly once', () => {
		const log: string[] = [];
		const symbol = Symbol('observed');
		const spread = {} as Record<PropertyKey, unknown>;
		for (const [name, value] of [
			['data-spread', 'spread'],
			['value', null],
			['defaultValue', 'default'],
		] as const) {
			Object.defineProperty(spread, name, {
				enumerable: true,
				get() {
					log.push(`spread:${name}`);
					return value;
				},
			});
		}
		Object.defineProperty(spread, symbol, {
			enumerable: true,
			get() {
				log.push('spread:symbol');
				return 'ignored';
			},
		});
		const result = mount(FormSpreadEvaluationOrder, {
			spread,
			read(name: string) {
				log.push(name);
				return name === 'value' ? 'direct' : name;
			},
		});
		try {
			expect(log).toEqual([
				'before',
				'value',
				'spread:data-spread',
				'spread:value',
				'spread:defaultValue',
				'spread:symbol',
				'after',
			]);
			expect((result.find('#form-spread-evaluation') as HTMLInputElement).value).toBe('default');
		} finally {
			result.unmount();
		}

		let reads = 0;
		const throwing = {} as Record<PropertyKey, unknown>;
		Object.defineProperty(throwing, symbol, {
			enumerable: true,
			get() {
				reads++;
				throw new Error('symbol getter');
			},
		});
		expect(() =>
			mount(FormSpreadEvaluationOrder, {
				spread: throwing,
				read: () => 'value',
			}),
		).toThrow('symbol getter');
		expect(reads).toBe(1);
	});

	// Per ReactJSXTransformIntegration-test.js:95. Replacing a prop preserves
	// that raw prop's first insertion position, so final DOM coercions run in the
	// same order as the merged JSX props object.
	it('applies final winners in raw-prop first-insertion order', () => {
		const log: string[] = [];
		const value = (label: string, output: string) => ({
			toString() {
				log.push(label);
				return output;
			},
		});
		const result = mount(HostApplicationOrder, {
			spread: {
				title: value('overwritten title', 'spread'),
				id: value('id', 'application-order'),
			},
			title: value('final title', 'direct'),
		});
		try {
			expect(log).toEqual(['final title', 'id']);
			expect(result.container.firstElementChild?.getAttribute('title')).toBe('direct');
			expect(result.container.firstElementChild?.id).toBe('application-order');
		} finally {
			result.unmount();
		}
	});

	it('orders alias winners by the winning raw prop position', () => {
		const log: string[] = [];
		const value = (label: string) => ({
			toString() {
				log.push(label);
				return label;
			},
		});
		const result = mount(AliasApplicationOrder, {
			firstFor: value('overwritten htmlFor'),
			id: value('id'),
			finalFor: value('final for'),
		});
		try {
			expect(log).toEqual(['id', 'final for']);
			expect(result.container.firstElementChild?.getAttribute('for')).toBe('final for');
		} finally {
			result.unmount();
		}
	});

	// Per ReactJSXTransformIntegration-test.js:95. A spread key that vanishes
	// cannot remove the unchanged later direct winner for attrs, class, style,
	// handlers, or refs.
	it('keeps later direct winners when an earlier spread drops collisions', () => {
		const directRef = { current: null as HTMLButtonElement | null };
		const spreadRef = { current: null as HTMLButtonElement | null };
		const spreadClick = vi.fn();
		const directClick = vi.fn();
		const result = mount(MutableHostCollision, {
			spread: {
				title: 'spread',
				className: 'spread',
				style: { color: 'red' },
				onClick: spreadClick,
				ref: spreadRef,
			},
			onClick: directClick,
			ref: directRef,
		});
		const button = result.find('#mutable-host-collision') as HTMLButtonElement;
		expect(button.title).toBe('fixed');
		expect(button.className).toBe('fixed');
		expect(button.style.color).toBe('blue');
		expect(directRef.current).toBe(button);
		expect(spreadRef.current).toBeNull();

		result.update(MutableHostCollision, {
			spread: {},
			onClick: directClick,
			ref: directRef,
		});
		expect(button.title).toBe('fixed');
		expect(button.className).toBe('fixed');
		expect(button.style.color).toBe('blue');
		expect(directRef.current).toBe(button);
		result.click('#mutable-host-collision');
		expect(directClick).toHaveBeenCalledTimes(1);
		expect(spreadClick).not.toHaveBeenCalled();
		result.unmount();
		expect(directRef.current).toBeNull();
	});

	// Per ReactJSXTransformIntegration-test.js:95. Duplicate direct JSX props
	// use the same final props snapshot as spread collisions, including aliases,
	// controlled state, raw HTML, and renderable children.
	it('resolves duplicate direct props by final writer on mount and update', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const secondDanger = { __html: '<b>second</b>' };
		const result = mount(DuplicateHostSources, {
			first: 'first',
			second: 'second',
			firstDanger: { __html: '<i>first</i>' },
			secondDanger,
			firstChild: 'first child',
			secondChild: 'second child',
		});
		try {
			expect(result.find('#duplicate-title').getAttribute('title')).toBe('second');
			expect(result.find('#duplicate-alias').getAttribute('for')).toBe('second');
			expect((result.find('#duplicate-value') as HTMLInputElement).value).toBe('second');
			expect(result.find('#duplicate-danger').innerHTML).toBe('<b>second</b>');
			expect(result.find('#duplicate-children').textContent).toBe('second child');

			result.update(DuplicateHostSources, {
				first: 'changed first',
				second: 'second',
				firstDanger: { __html: '<i>changed first</i>' },
				secondDanger,
				firstChild: 'changed first child',
				secondChild: 'second child',
			});
			expect(result.find('#duplicate-title').getAttribute('title')).toBe('second');
			expect(result.find('#duplicate-alias').getAttribute('for')).toBe('second');
			expect((result.find('#duplicate-value') as HTMLInputElement).value).toBe('second');
			expect(result.find('#duplicate-danger').innerHTML).toBe('<b>second</b>');
			expect(result.find('#duplicate-children').textContent).toBe('second child');

			result.update(DuplicateHostSources, {
				first: 'changed first',
				second: undefined,
				firstDanger: { __html: '<i>changed first</i>' },
				secondDanger: null,
				firstChild: 'changed first child',
				secondChild: null,
			});
			expect(result.find('#duplicate-title').hasAttribute('title')).toBe(false);
			expect(result.find('#duplicate-alias').hasAttribute('for')).toBe(false);
			expect((result.find('#duplicate-value') as HTMLInputElement).value).toBe('second');
			expect(result.find('#duplicate-danger').innerHTML).toBe('');
			expect(result.find('#duplicate-children').textContent).toBe('');
		} finally {
			result.unmount();
		}
	});

	// Per ReactElement-test.js children precedence and
	// ReactJSXTransformIntegration-test.js:95. Nested JSX is the final children
	// writer; otherwise direct/spread children render through the ordinary child
	// channel and later null clears prior content.
	it('renders final direct and spread children and updates them', () => {
		const result = mount(PropChildrenSources, {
			direct: 'direct',
			first: { children: 'first' },
			second: { children: 'second' },
			nested: { children: 'ignored' },
		});
		try {
			expect(result.find('#direct-prop-child').textContent).toBe('direct');
			expect(result.find('#spread-prop-child').textContent).toBe('second');
			expect(result.find('#nested-child-wins').textContent).toBe('nested');

			result.update(PropChildrenSources, {
				direct: createElement('strong', { id: 'direct-child-element' }, 'element'),
				first: { children: 'first' },
				second: { children: null },
				nested: { children: 'still ignored' },
			});
			expect(result.find('#direct-child-element').textContent).toBe('element');
			expect(result.find('#spread-prop-child').textContent).toBe('');
			expect(result.find('#nested-child-wins').textContent).toBe('nested');

			result.update(PropChildrenSources, {
				direct: null,
				first: { children: 'first returns' },
				second: {},
				nested: {},
			});
			expect(result.find('#direct-prop-child').textContent).toBe('');
			expect(result.find('#spread-prop-child').textContent).toBe('first returns');
		} finally {
			result.unmount();
		}
	});

	// Per ReactDOMComponent-test.js:2068. Validation observes the final source
	// set, so disabling raw HTML and introducing ordinary children in one render
	// cannot conflict with the previous render's stale raw-HTML state.
	it('switches from spread raw HTML to spread children in one update', () => {
		const result = mount(DangerToSpreadChild, {
			source: { dangerouslySetInnerHTML: { __html: '<b>raw</b>' } },
		});
		try {
			const element = result.find('#danger-to-spread-child');
			expect(element.innerHTML).toBe('<b>raw</b>');
			result.update(DangerToSpreadChild, { source: { children: 'ordinary' } });
			expect(element.textContent).toBe('ordinary');
		} finally {
			result.unmount();
		}
	});

	// Per ReactDOMComponent-test.js:1794/:1807. A dynamic nested child on a
	// void host is allowed only while its evaluated value is nullish.
	it('validates a dynamic void child on mount and update', () => {
		for (const child of [null, undefined]) {
			const result = mount(DynamicVoidChild, { child });
			expect(result.find('#dynamic-void-child').childNodes).toHaveLength(0);
			result.unmount();
		}
		for (const child of [false, 0, '', {}, createElement('span')]) {
			expect(() => mount(DynamicVoidChild, { child })).toThrow(/void element/);
		}

		for (const child of [false, 0, '']) {
			const result = mount(DynamicVoidChild, { child: null });
			try {
				expect(() => result.update(DynamicVoidChild, { child })).toThrow(/void element/);
				expect(() => result.update(DynamicVoidChild, { child })).toThrow(/void element/);
			} finally {
				result.unmount();
			}
		}
	});
});
