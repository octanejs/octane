import { expect, it } from 'vitest';
import { createElement } from 'octane';
import { compile } from 'octane/compiler';
import { renderToString } from 'octane/server';
import { loadServerFixture } from '../_server-fixture.js';
import { collectPipeableStream } from '../_server-stream.js';
import * as client from './_fixtures/server-input-spread-cascade.tsrx';
import { createServerRenderMatrix } from './_helpers/server-render-matrix.js';

const FIXTURE = 'packages/octane/tests/conformance/_fixtures/server-input-spread-cascade.tsrx';
const server = loadServerFixture<typeof client>(FIXTURE);
const matrix = createServerRenderMatrix({ clientModule: client, serverModule: server });

// Per ReactDOMServerIntegrationInput-test.js:84 and
// ReactDOMServerIntegrationCheckbox-test.js:88. A controlled writer wins over
// its default writer regardless of prop order or intervening spreads.
matrix.itRenders('resolves input controlled/default cascades across spreads', {
	component: 'InputSpreadCascades',
	mismatch: {
		mutateServerDom(container) {
			container.innerHTML = '<aside id="wrong-input-spread-tree">wrong</aside>';
		},
	},
	assertCommon({ root }) {
		const inputs = root.querySelectorAll<HTMLInputElement>('#input-spread-cascades input');
		expect(inputs).toHaveLength(5);
		for (const input of inputs) {
			expect(input.value).toBe('controlled');
			expect(input.defaultValue).toBe('controlled');
			expect(input.getAttribute('value')).toBe('controlled');
			expect(input.checked).toBe(true);
			expect(input.defaultChecked).toBe(true);
			expect(input.hasAttribute('checked')).toBe(true);
		}
		expect(root.querySelector('#wrong-input-spread-tree')).toBeNull();
	},
});

// Per ReactDOMServerIntegrationInput-test.js:84 and
// ReactDOMServerIntegrationCheckbox-test.js:88. Both competing props still
// evaluate in authored JSX order before the controlled writer is selected.
it('preserves direct input prop evaluation order while resolving cascades', () => {
	const log: string[] = [];
	const values: Record<string, unknown> = {
		title: 'title',
		defaultValue: 'default',
		middle: 'middle',
		value: 'controlled',
		defaultChecked: false,
		checked: true,
	};
	const html = renderToString(server.InputDirectEvaluationOrder, {
		read(name: string) {
			log.push(name);
			return values[name];
		},
	}).html;
	expect(log).toEqual(['title', 'defaultValue', 'middle', 'value', 'defaultChecked', 'checked']);
	expect(html).toContain('value="controlled"');
	expect(html).toContain(' checked');
});

// Per ReactDOMServerIntegrationInput-test.js:84, adapted to a spread with
// getters: the spread snapshot executes at its authored position and only once.
it('preserves input evaluation order across spread getters and direct props', () => {
	const log: string[] = [];
	const spread = {} as Record<string, unknown>;
	for (const [name, value] of [
		['data-spread', 'spread'],
		['defaultValue', 'spread-default'],
		['checked', true],
	] as const) {
		Object.defineProperty(spread, name, {
			enumerable: true,
			get() {
				log.push(`spread:${name}`);
				return value;
			},
		});
	}
	Object.defineProperty(spread, Symbol('ignored'), {
		enumerable: true,
		get() {
			log.push('spread:symbol');
			return 'ignored';
		},
	});
	const html = renderToString(server.InputSpreadEvaluationOrder, {
		spread,
		read(name: string) {
			log.push(name);
			return name === 'value-before'
				? 'controlled'
				: name === 'default-after'
					? 'direct-default'
					: 'title';
		},
	}).html;
	expect(log).toEqual([
		'value-before',
		'spread:data-spread',
		'spread:defaultValue',
		'spread:checked',
		'spread:symbol',
		'title-after',
		'default-after',
	]);
	expect(html).toContain('value="controlled"');
	expect(html).toContain(' checked');
});

// Object spread evaluates enumerable symbol properties even though symbols are
// not DOM prop names. Getter failures therefore remain observable during SSR.
it('evaluates ignored enumerable symbol getters in JSX spreads', () => {
	const spread = {} as Record<PropertyKey, unknown>;
	Object.defineProperty(spread, Symbol('throws'), {
		enumerable: true,
		get() {
			throw new Error('symbol getter failed');
		},
	});
	expect(() =>
		renderToString(server.InputSpreadEvaluationOrder, {
			spread,
			read() {
				return 'value';
			},
		}),
	).toThrow('symbol getter failed');
});

// Per ReactDOMServerIntegrationTextarea-test.js:80-105 and
// ReactDOMServerIntegrationSelect-test.js:61-64/:91-129. Native form state
// supplied through a JSX spread uses the same controlled-over-default cascade:
// textarea writes content, select projects onto options, and neither receives a
// generic value/defaultValue attribute.
matrix.itRenders('resolves textarea and select form state across spreads', {
	component: 'TextareaSelectSpreadCascades',
	mismatch: {
		mutateServerDom(container) {
			container.innerHTML = '<aside id="wrong-textarea-select-tree">wrong</aside>';
		},
	},
	assertCommon({ root }) {
		const textareas = root.querySelectorAll<HTMLTextAreaElement>(
			'#textarea-select-spread-cascades textarea[data-expected="controlled"]',
		);
		expect(textareas).toHaveLength(4);
		for (const textarea of textareas) {
			expect(textarea.value).toBe('controlled');
			expect(textarea.defaultValue).toBe('controlled');
			expect(textarea.getAttribute('value')).toBeNull();
			expect(textarea.getAttribute('defaultValue')).toBeNull();
		}
		expect(root.querySelector<HTMLTextAreaElement>('#textarea-spread-value-undefined')?.value).toBe(
			'value child',
		);
		expect(root.querySelector<HTMLTextAreaElement>('#textarea-spread-value-null')?.value).toBe(
			'null child',
		);
		expect(
			root.querySelector<HTMLTextAreaElement>('#textarea-spread-default-undefined')?.value,
		).toBe('default child');

		const controlled = root.querySelector<HTMLSelectElement>('#select-spread-controlled')!;
		const defaultLast = root.querySelector<HTMLSelectElement>('#select-spread-default-last')!;
		const multiple = root.querySelector<HTMLSelectElement>('#select-spread-multiple')!;
		const directMultiple = root.querySelector<HTMLSelectElement>('#select-spread-direct-multiple')!;
		for (const select of [controlled, defaultLast, multiple, directMultiple]) {
			expect(select.getAttribute('value')).toBeNull();
			expect(select.getAttribute('defaultValue')).toBeNull();
		}
		expect(Array.from(controlled.selectedOptions, (option) => option.value)).toEqual(['bar']);
		expect(Array.from(defaultLast.selectedOptions, (option) => option.value)).toEqual(['bar']);
		expect(multiple.multiple).toBe(true);
		expect(multiple.getAttribute('multiple')).toBe('');
		expect(Array.from(multiple.selectedOptions, (option) => option.value)).toEqual(['bar', 'baz']);
		expect(directMultiple.multiple).toBe(true);
		expect(directMultiple.getAttribute('multiple')).toBe('');
		expect(Array.from(directMultiple.selectedOptions, (option) => option.value)).toEqual([
			'bar',
			'baz',
		]);
		expect(root.querySelector('#wrong-textarea-select-tree')).toBeNull();
	},
});

// Per ReactDOMServerIntegrationTextarea-test.js:80-105. A spread snapshot
// reads each getter once at its authored position while controlled value still
// owns textarea content over every defaultValue writer.
it('preserves textarea evaluation order across spread getters', () => {
	const log: string[] = [];
	const spread = {} as Record<string, unknown>;
	for (const [name, value] of [
		['data-spread', 'spread'],
		['defaultValue', 'spread-default'],
	] as const) {
		Object.defineProperty(spread, name, {
			enumerable: true,
			get() {
				log.push(`spread:${name}`);
				return value;
			},
		});
	}
	const html = renderToString(server.TextareaSpreadEvaluationOrder, {
		spread,
		read(name: string) {
			log.push(name);
			return name === 'value-before'
				? 'controlled'
				: name === 'default-after'
					? 'direct-default'
					: 'title';
		},
	}).html;
	expect(log).toEqual([
		'value-before',
		'spread:data-spread',
		'spread:defaultValue',
		'title-after',
		'default-after',
	]);
	const container = document.createElement('div');
	container.innerHTML = html;
	const textarea = container.querySelector('textarea')!;
	expect(textarea.value).toBe('controlled');
	expect(textarea.getAttribute('value')).toBeNull();
	expect(textarea.getAttribute('defaultValue')).toBeNull();
});

// Per ReactDOMServerIntegrationSelect-test.js:61-64/:91-129. Spread-held
// multiple/value props evaluate once in source order, serialize only multiple,
// and select the matching options instead of leaking value onto the host.
it('preserves select evaluation order across spread getters', () => {
	const log: string[] = [];
	const spread = {} as Record<string, unknown>;
	for (const [name, value] of [
		['data-spread', 'spread'],
		['value', ['bar', 'baz']],
	] as const) {
		Object.defineProperty(spread, name, {
			enumerable: true,
			get() {
				log.push(`spread:${name}`);
				return value;
			},
		});
	}
	const html = renderToString(server.SelectSpreadEvaluationOrder, {
		spread,
		read(name: string) {
			log.push(name);
			return name === 'default-before' ? 'foo' : name === 'multiple-after' ? true : 'title';
		},
	}).html;
	expect(log).toEqual([
		'default-before',
		'spread:data-spread',
		'spread:value',
		'multiple-after',
		'title-after',
	]);
	const container = document.createElement('div');
	container.innerHTML = html;
	const select = container.querySelector('select')!;
	expect(select.multiple).toBe(true);
	expect(select.getAttribute('value')).toBeNull();
	expect(select.getAttribute('defaultValue')).toBeNull();
	expect(Array.from(select.selectedOptions, (option) => option.value)).toEqual(['bar', 'baz']);
});

// Per ReactJSXTransformIntegration-test.js:95 and
// ReactDOMServerIntegrationAttributes-test.js:50/:243/:410. JSX snapshots
// direct and spread props into one final prop set before DOM serialization, so
// every normalized native attribute has one last-writer-wins server value.
matrix.itRenders('resolves arbitrary native attribute collisions across spreads', {
	component: 'AttributeSpreadCollisions',
	mismatch: {
		mutateServerDom(container) {
			container.innerHTML = '<aside id="wrong-attribute-spread-tree">wrong</aside>';
		},
	},
	assertCommon({ root }) {
		const directBefore = root.querySelector<HTMLElement>('#attr-direct-before')!;
		expect(directBefore.title).toBe('spread');
		expect(directBefore.dataset.collision).toBe('spread');
		const spreadBefore = root.querySelector<HTMLElement>('#attr-spread-before')!;
		expect(spreadBefore.title).toBe('direct');
		expect(spreadBefore.dataset.collision).toBe('direct');
		const spreadSpread = root.querySelector<HTMLElement>('#attr-spread-spread')!;
		expect(spreadSpread.title).toBe('second');
		expect(spreadSpread.dataset.collision).toBe('second');
		expect(spreadSpread.className).toBe('second active');
		expect(root.querySelector('#attr-nullish-removal')?.hasAttribute('title')).toBe(false);
		expect(root.querySelector('#attr-alias')?.getAttribute('for')).toBe('second');
		expect(root.querySelector<HTMLElement>('#attr-style')?.style.color).toBe('blue');
		const svgAlias = root.querySelector('#attr-svg-alias')!;
		expect(svgAlias.getAttribute('stroke-width')).toBe('2');
		expect(svgAlias.getAttribute('xlink:href')).toBe('#second');
		expect(root.querySelector('#attr-custom')?.getAttribute('camelCase')).toBe('second');
		const select = root.querySelector<HTMLSelectElement>('#attr-option-select')!;
		expect(select.value).toBe('second');
		expect(select.options[0].getAttribute('value')).toBe('second');
		expect(root.querySelector('#wrong-attribute-spread-tree')).toBeNull();
	},
});

// Per ReactJSXTransformIntegration-test.js:95. Spread getters are captured once
// at their authored position even though the final normalized attribute set is
// resolved only after every source has evaluated.
it('preserves arbitrary attribute evaluation order while resolving collisions', () => {
	const log: string[] = [];
	const makeSpread = (label: string, entries: Record<string, unknown>) => {
		const spread = {} as Record<string, unknown>;
		for (const [name, value] of Object.entries(entries)) {
			Object.defineProperty(spread, name, {
				enumerable: true,
				get() {
					log.push(`${label}:${name}`);
					return value;
				},
			});
		}
		return spread;
	};
	const html = renderToString(server.AttributeSpreadEvaluationOrder, {
		first: makeSpread('first', { title: 'first', 'data-collision': 'first' }),
		second: makeSpread('second', {
			title: 'second',
			'data-collision': 'second',
			className: 'final-class',
		}),
		read(name: string) {
			log.push(name);
			return name;
		},
	}).html;
	expect(log).toEqual([
		'direct-before',
		'first:title',
		'first:data-collision',
		'middle',
		'event-between',
		'second:title',
		'second:data-collision',
		'second:className',
		'direct-after',
	]);
	const container = document.createElement('div');
	container.innerHTML = html;
	const element = container.querySelector('#attribute-spread-evaluation-order')!;
	expect(html.match(/ title=/g)).toHaveLength(1);
	expect(html.match(/ data-collision=/g)).toHaveLength(1);
	expect(element.getAttribute('title')).toBe('direct-after');
	expect(element.getAttribute('data-collision')).toBe('second');
	expect(element.getAttribute('data-middle')).toBe('middle');
	expect(element.getAttribute('class')).toBe('final-class');
});

// Per ReactJSXTransformIntegration-test.js:95. Replacing an existing prop does
// not move its insertion position in the JSX props snapshot.
it('retains first insertion order when a later direct writer replaces the same prop', () => {
	expect(renderToString(server.AttributeSpreadOrder).html).toBe('<div a="3" b="2"></div>');
});

// Per ReactJSXTransformIntegration-test.js:95. `children` participates in JSX
// prop merging but renders as content; nested JSX is the implicit final writer.
matrix.itRenders('renders final direct and spread children props as host content', {
	component: 'HostChildrenPropCascades',
	props: () => ({
		direct: 'direct',
		directThenSpread: { children: 'spread' },
		spreadThenDirect: { children: 'spread' },
		first: { children: 'first' },
		second: { children: 'second' },
		cleared: { children: null },
		omitted: {},
		nested: { children: 'ignored' },
		renderable: {
			children: createElement('strong', { id: 'children-prop-element' }, 'rich'),
		},
		textarea: { children: 'spread textarea', value: null },
	}),
	assertCommon({ root }) {
		expect(root.querySelector('#children-direct')?.textContent).toBe('direct');
		expect(root.querySelector('#children-direct-spread')?.textContent).toBe('spread');
		expect(root.querySelector('#children-spread-direct')?.textContent).toBe('direct');
		expect(root.querySelector('#children-spread-spread')?.textContent).toBe('second');
		expect(root.querySelector('#children-cleared')?.textContent).toBe('');
		expect(root.querySelector('#children-omitted')?.textContent).toBe('first');
		expect(root.querySelector('#children-nested')?.textContent).toBe('nested');
		expect(root.querySelector('#children-nested-null')?.textContent).toBe('');
		expect(root.querySelector('#children-prop-element')?.textContent).toBe('rich');
		expect(root.querySelector<HTMLTextAreaElement>('#textarea-direct-children-prop')?.value).toBe(
			'direct textarea',
		);
		expect(root.querySelector<HTMLTextAreaElement>('#textarea-spread-children-prop')?.value).toBe(
			'spread textarea',
		);
	},
});

// Per ReactDOMServerIntegrationInput-test.js:84. Generic prop coercions run
// before the effective form state is serialized, even when value was authored first.
it('coerces generic attributes before effective input form state', () => {
	const log: string[] = [];
	const tracked = (name: string, value: string) => ({
		toString() {
			log.push(name);
			return value;
		},
	});
	const html = renderToString(server.InputFormCoercionOrder, {
		value: tracked('value', 'controlled'),
		spread: { 'data-spread': tracked('spread', 'spread') },
		title: tracked('title', 'title'),
	}).html;
	expect(log).toEqual(['spread', 'title', 'value']);
	expect(html).toContain('data-spread="spread"');
	expect(html).toContain('title="title"');
	expect(html).toContain('value="controlled"');

	log.length = 0;
	const directHtml = renderToString(server.InputDirectFormCoercionOrder, {
		value: tracked('value', 'direct-controlled'),
		title: tracked('title', 'direct-title'),
	}).html;
	expect(log).toEqual(['title', 'value']);
	expect(directHtml).toContain('title="direct-title"');
	expect(directHtml).toContain('value="direct-controlled"');
});

// Per ReactJSXTransformIntegration-test.js:95. Repeated direct props use the
// same last-writer merge as spreads, including aliases, content, and form state.
it('resolves duplicate direct native props before SSR serialization', () => {
	const log: string[] = [];
	const html = renderToString(server.DirectDuplicateAttributes, {
		read(name: string) {
			log.push(name);
			return name;
		},
	}).html;
	const container = document.createElement('div');
	container.innerHTML = html;
	expect(log).toEqual(['first', 'second']);
	expect(container.querySelector('#duplicate-title')?.getAttribute('title')).toBe('second');
	expect(container.querySelector('#duplicate-alias')?.getAttribute('for')).toBe('second');
	expect(container.querySelector('#duplicate-class')?.getAttribute('class')).toBe('second');
	expect(container.querySelector('#duplicate-children')?.textContent).toBe('second');
	expect(container.querySelector('#duplicate-danger-null')?.textContent).toBe('fallback');
	expect(container.querySelector<HTMLTextAreaElement>('#duplicate-textarea-value')?.value).toBe(
		'second',
	);
	expect(container.querySelector<HTMLSelectElement>('#duplicate-select-multiple')?.multiple).toBe(
		true,
	);
	const select = container.querySelector<HTMLSelectElement>('#duplicate-select-value')!;
	expect(select.value).toBe('second');
	expect(select.options[0].getAttribute('value')).toBe('second');
	expect(container.querySelector('#duplicate-dynamic-title')?.getAttribute('title')).toBe('second');
});

// Per ReactDOMComponent-test.js:1794/:1807. A void host accepts a single
// dynamically nullish child, but every non-nullish value is still invalid.
it('validates dynamic nested void children after evaluating attributes', async () => {
	for (const child of [null, undefined]) {
		const log: string[] = [];
		const html = renderToString(server.VoidDynamicNestedChild, {
			read(name: string) {
				log.push(name);
				return name === 'attr' ? 'attribute' : child;
			},
		}).html;
		expect(log).toEqual(['attr', 'child']);
		const container = document.createElement('div');
		container.innerHTML = html;
		expect(container.querySelector('#void-dynamic-nested-child')).not.toBeNull();
	}

	for (const child of [false, 0, '']) {
		expect(() =>
			renderToString(server.VoidDynamicNestedChild, {
				read(name: string) {
					return name === 'attr' ? 'attribute' : child;
				},
			}),
		).toThrow(/void element/);
	}

	const streamed = await collectPipeableStream(server.VoidDynamicNestedChild, {
		read(name: string) {
			return name === 'attr' ? 'attribute' : false;
		},
	});
	expect(streamed.html).toBe('');
	expect(streamed.errors).toHaveLength(1);
	expect(String(streamed.errors[0])).toMatch(/void element/);
});

// Null/undefined/void expressions and formatting-only children are syntactic
// children but no content. `void expr` still evaluates exactly once.
it('self-closes void hosts with nullish, whitespace, and comment-only children', () => {
	for (const mode of ['client', 'server'] as const) {
		for (const child of ['{null}', '{undefined}', '{void props.run()}']) {
			const source = `export function C(props) @{ <input>${child}</input> }`;
			expect(() => compile(source, 'void-nullish-child.tsrx', { mode })).not.toThrow();
		}
		for (const child of ['{false}', '{0}', "{''}", '{null}{undefined}']) {
			const source = `export function C() @{ <input>${child}</input> }`;
			expect(() => compile(source, 'void-nonnull-child.tsrx', { mode })).toThrow(/void element/);
		}
	}

	let runs = 0;
	expect(
		renderToString(server.VoidNullishSideEffect, {
			onRun() {
				runs++;
			},
		}).html,
	).toContain('id="void-nullish-side-effect"');
	expect(runs).toBe(1);
	expect(renderToString(server.VoidWhitespaceOnly).html).toContain('id="void-whitespace-only"');
	expect(renderToString(server.VoidNestedNullWins).html).toContain('id="void-nested-null-wins"');
});

// Duplicate direct content props are source-resolved before void validation:
// later nullish writers disable stale or malformed earlier values.
it('validates only the final direct raw-HTML writer on void hosts', async () => {
	for (const props of [
		{ first: { __html: 'stale' }, second: null },
		{ first: 'malformed', second: undefined },
	]) {
		expect(renderToString(server.VoidDirectDangerSources, props).html).toContain(
			'id="void-direct-danger-sources"',
		);
	}

	for (const second of [{ __html: '' }, 'malformed']) {
		const props = { first: null, second };
		expect(() => renderToString(server.VoidDirectDangerSources, props)).toThrow(
			second === 'malformed' ? /must be in the form|void element/ : /void element/,
		);
		const streamed = await collectPipeableStream(server.VoidDirectDangerSources, props);
		expect(streamed.errors).toHaveLength(1);
	}
});
