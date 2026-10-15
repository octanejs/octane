import { describe, it, expect } from 'vitest';
import { act, mount } from './_helpers';
import { createElement } from '../src/index.js';
import {
	App,
	ConditionalEditor,
	EditorRows,
	SingleEditorRetryRows,
	MultipleEditorRetryRows,
} from './_fixtures/anchorless-host.tsrx';

// A LONE PURE-HOST descriptor at a value position (a pass-through component's
// return, a host descriptor rendered at a root) mounts ANCHORLESS — no comment
// markers, the element self-delimits (childSlot's analogue of componentSlot's
// singleRoot regime). RTL's `container.firstChild` idiom depends on this. When
// a later render flips the slot's value to any other mode, the slot promotes
// to the normal marked regime in place.

// React-style pass-through: whatever `children` value it's given is what the
// root renders — this is exactly @octanejs/testing-library's ValueRoot shim.
const Pass = (props: any) => props.children;

function PlainEditorChild(props: { tag: string }) {
	return createElement(
		props.tag,
		{ 'data-label': 'ready', defaultValue: 'server draft' },
		createElement('input', { defaultValue: 'native draft' }),
	);
}

function PlainDescriptorEditor(props: { tag: string; show: boolean }) {
	return createElement(
		'section',
		null,
		createElement('b', null, 'A'),
		props.show ? createElement(PlainEditorChild, { tag: props.tag }) : null,
		createElement('b', null, 'B'),
	);
}

describe('anchorless lone pure-host value', () => {
	it('mounts with NO comment anchors — container.firstChild IS the element', () => {
		const r = mount(Pass, { children: createElement('div', { id: 'a' }, 'hello') });
		expect(r.container.innerHTML).toBe('<div id="a">hello</div>');
		expect(r.container.firstChild).toBe(r.find('#a'));
		r.unmount();
	});

	it('reconciles a same-tag re-render in place (node identity survives)', () => {
		const r = mount(Pass, { children: createElement('div', { id: 'a' }, 'one') });
		const node = r.container.firstChild;
		r.update(Pass, { children: createElement('div', { id: 'b' }, 'two') });
		expect(r.container.firstChild).toBe(node);
		expect(r.container.innerHTML).toBe('<div id="b">two</div>');
		r.unmount();
	});

	it('rebuilds on a tag flip, still anchorless', () => {
		const r = mount(Pass, { children: createElement('div', undefined, 'div') });
		r.update(Pass, { children: createElement('span', undefined, 'span') });
		expect(r.container.innerHTML).toBe('<span>span</span>');
		r.unmount();
	});

	it.each([false, true])(
		'does not connect a pure host after its property setter unmounts the root (nested: %s)',
		(nested) => {
			let dispose: (() => void) | undefined;
			let calls = 0;
			let connections = 0;
			class DisposingElement extends HTMLElement {
				static observedAttributes = ['data-dispose'];
				attributeChangedCallback() {
					calls++;
					dispose?.();
				}
				connectedCallback() {
					connections++;
				}
			}
			const tag = nested ? 'anchorless-nested-disposer' : 'anchorless-root-disposer';
			customElements.define(tag, DisposingElement);
			const r = mount(Pass, { children: createElement('div', undefined, 'previous') });
			dispose = () => r.unmount();
			const next = createElement(tag, { 'data-dispose': 'true' }, 'obsolete');
			r.update(Pass, { children: nested ? createElement('div', undefined, next) : next });
			expect(calls).toBe(1);
			expect(connections).toBe(0);
			expect(r.container.childNodes).toHaveLength(0);
		},
	);

	it.each([false, true])(
		'connects a new custom host with its initial attributes (nested: %s)',
		(nested) => {
			const seen: (string | null)[] = [];
			const tag = nested ? 'nested-initial-editor' : 'root-initial-editor';
			customElements.define(
				tag,
				class extends HTMLElement {
					connectedCallback() {
						seen.push(this.getAttribute('data-label'));
					}
				},
			);
			const host = createElement(tag, { 'data-label': 'ready' });
			const r = mount(Pass, { children: nested ? createElement('section', null, host) : host });
			try {
				expect(seen).toEqual(['ready']);
				expect(r.find(tag).getAttribute('data-label')).toBe('ready');
			} finally {
				r.unmount();
			}
		},
	);

	it('initializes custom editors before each new keyed run connects', () => {
		const seen: (string | null)[] = [];
		const tag = 'keyed-initial-editor';
		customElements.define(
			tag,
			class extends HTMLElement {
				connectedCallback() {
					seen.push(this.getAttribute('data-label'));
				}
			},
		);
		const children = (labels: string[]) =>
			labels.map((label) => createElement(tag, { key: label, 'data-label': label }));
		const r = mount(Pass, { children: children(['first']) });
		try {
			const survivor = r.find(tag);
			expect(seen).toEqual(['first']);
			r.update(Pass, { children: children(['first', 'second', 'third']) });
			expect(seen).toEqual(['first', 'second', 'third']);
			expect(r.find(tag)).toBe(survivor);
		} finally {
			r.unmount();
		}
	});

	it('initializes a custom editor in a compiled single-host keyed row before it connects', () => {
		const seen: (string | null)[] = [];
		const tag = 'compiled-row-initial-editor';
		customElements.define(
			tag,
			class extends HTMLElement {
				connectedCallback() {
					seen.push(this.getAttribute('data-label'));
				}
			},
		);
		const r = mount(EditorRows, { tag, labels: ['first'] });
		try {
			const survivor = r.find('li');
			expect(seen).toEqual(['first']);
			r.update(EditorRows, { tag, labels: ['first', 'second', 'third'] });
			expect(seen).toEqual(['first', 'second', 'third']);
			expect(r.find('li')).toBe(survivor);
		} finally {
			r.unmount();
		}
	});

	it.each([
		['single', SingleEditorRetryRows],
		['multiple', MultipleEditorRetryRows],
	] as const)('drops abandoned custom receipts on a %s-host keyed retry', async (kind, Rows) => {
		const events: string[] = [];
		const tag = `retry-${kind}-editor`;
		customElements.define(
			tag,
			class extends HTMLElement {
				static observedAttributes = ['data-label'];
				attributeChangedCallback() {
					events.push(`attribute:${this.getAttribute('data-label')}`);
				}
				connectedCallback() {
					events.push(`connect:${this.getAttribute('data-label')}`);
				}
			},
		);
		let resume!: (value: string) => void;
		const gate = new Promise<string>((resolve) => {
			resume = resolve;
		});
		const first = { id: 'a', tag: 'input', label: 'first' };
		const root = mount(Rows, { rows: [first] });
		try {
			const survivor = root.find('[data-id="a"]');
			const input = survivor.querySelector('input')!;
			input.value = 'keep my draft';
			root.update(Rows, { rows: [first, { id: 'b', tag, label: 'abandoned' }], gate });
			expect(root.find('[data-id="a"]')).toBe(survivor);
			expect(input.value).toBe('keep my draft');
			expect(root.container.querySelector('[data-id="b"]')).toBeNull();
			expect(events).toEqual([]);

			root.update(Rows, { rows: [first, { id: 'b', tag: 'span', label: 'replacement' }] });
			await act(() => resume('late'));
			expect(root.find('[data-id="a"]')).toBe(survivor);
			expect(root.find('[data-id="b"] span').getAttribute('data-label')).toBe('replacement');
			expect(input.value).toBe('keep my draft');
			expect(events).toEqual([]);

			root.update(Rows, {
				rows: [
					first,
					{ id: 'b', tag: 'span', label: 'replacement' },
					{ id: 'c', tag, label: 'current' },
				],
			});
			expect(events).toEqual(['attribute:current', 'connect:current']);
			expect(root.find('[data-id="a"]')).toBe(survivor);
			expect(input.value).toBe('keep my draft');
		} finally {
			root.unmount();
		}
	});

	it('stops later compiled rows when a new custom host replaces the root during commit', () => {
		const connected: (string | null)[] = [];
		let replace: (() => void) | undefined;
		const tag = 'compiled-row-replacing-editor';
		customElements.define(
			tag,
			class extends HTMLElement {
				static observedAttributes = ['data-label'];
				attributeChangedCallback(_name: string, _old: string | null, value: string) {
					if (value === 'second') replace?.();
				}
				connectedCallback() {
					connected.push(this.getAttribute('data-label'));
				}
			},
		);
		function Replacement() {
			return createElement('p', { id: 'replacement' }, 'Replacement');
		}
		const r = mount(EditorRows, { tag, labels: ['first'] });
		try {
			replace = () => r.update(Replacement, { tag, labels: [] });
			r.update(EditorRows, { tag, labels: ['first', 'second', 'third'] });
			expect(connected).toEqual(['first']);
			expect(r.container.textContent).toBe('Replacement');
			expect(r.container.querySelectorAll(tag)).toHaveLength(0);
		} finally {
			r.unmount();
		}
	});

	it.each([
		['text', 'AplainB'],
		['comp', 'AsoloB'],
	])('initializes a custom editor when it replaces %s inside an existing section', (mode, text) => {
		const seen: (string | null)[] = [];
		const tag = `replacement-${mode}-editor`;
		customElements.define(
			tag,
			class extends HTMLElement {
				connectedCallback() {
					seen.push(this.getAttribute('data-label'));
				}
			},
		);
		const r = mount(App, { mode, tag });
		try {
			const section = r.find('section');
			expect(section.textContent).toBe(text);
			r.update(App, { mode: 'editor', tag });
			expect(r.find('section')).toBe(section);
			expect(section.textContent).toBe('AeditorB');
			expect(seen).toEqual(['ready']);
		} finally {
			r.unmount();
		}
	});

	it.each(['text', 'comp'])(
		'does not connect a custom editor replacing %s when its initial attribute unmounts the root',
		(mode) => {
			let dispose: (() => void) | undefined;
			const events: string[] = [];
			const tag = `disposer-${mode}-editor`;
			customElements.define(
				tag,
				class extends HTMLElement {
					static observedAttributes = ['data-label'];
					attributeChangedCallback() {
						events.push('attribute');
						dispose?.();
					}
					connectedCallback() {
						events.push('connected');
					}
				},
			);
			const r = mount(App, { mode, tag });
			dispose = () => r.unmount();
			r.update(App, { mode: 'editor', tag });
			expect(events).toEqual(['attribute']);
			expect(r.container.childNodes).toHaveLength(0);
		},
	);

	it.each([
		['compiled', ConditionalEditor, 'AwaitingB'],
		['plain', PlainDescriptorEditor, 'AB'],
	] as const)(
		'initializes a newly mounted conditional editor before connection (%s)',
		(kind, View, before) => {
			const observations: Array<{
				label: string | null;
				defaultValue: string | null;
				inputDefaultValue: string | undefined;
			}> = [];
			const tag = `conditional-${kind}-component-editor`;
			customElements.define(
				tag,
				class extends HTMLElement {
					connectedCallback() {
						observations.push({
							label: this.getAttribute('data-label'),
							defaultValue: this.getAttribute('defaultValue'),
							inputDefaultValue: this.querySelector('input')?.defaultValue,
						});
					}
				},
			);
			const r = mount(View, { tag, show: false });
			try {
				const section = r.find('section');
				expect(section.textContent).toBe(before);
				r.update(View, { tag, show: true });
				expect(r.find('section')).toBe(section);
				expect(r.find(tag).getAttribute('data-label')).toBe('ready');
				expect(r.find(tag).getAttribute('defaultValue')).toBe('server draft');
				expect(observations).toEqual([
					{ label: 'ready', defaultValue: 'server draft', inputDefaultValue: 'native draft' },
				]);
			} finally {
				r.unmount();
			}
		},
	);

	it.each([
		['compiled', ConditionalEditor],
		['plain', PlainDescriptorEditor],
	] as const)(
		'does not connect a newly mounted conditional editor after its initial attributes unmount the root (%s)',
		(kind, View) => {
			const tag = `conditional-${kind}-component-disposer`;
			const events: string[] = [];
			let dispose: (() => void) | undefined;
			customElements.define(
				tag,
				class extends HTMLElement {
					static observedAttributes = ['data-label'];
					attributeChangedCallback() {
						events.push('attribute');
						dispose?.();
					}
					connectedCallback() {
						events.push('connected');
					}
				},
			);
			const r = mount(View, { tag, show: false });
			dispose = () => r.unmount();
			r.update(View, { tag, show: true });
			expect(events).toEqual(['attribute']);
			expect(r.container.childNodes).toHaveLength(0);
		},
	);

	it('attaches the ref on mount and detaches it when the value flips away', () => {
		const ref: { current: Element | null } = { current: null };
		const r = mount(Pass, { children: createElement('div', { ref }) });
		expect(ref.current).toBe(r.container.firstChild);
		r.update(Pass, { children: 'text' });
		expect(ref.current).toBe(null);
		expect(r.container.textContent).toBe('text');
		r.unmount();
	});

	it('detaches the ref on root unmount', () => {
		const ref: { current: Element | null } = { current: null };
		const r = mount(Pass, { children: createElement('div', { ref }) });
		expect(ref.current).not.toBe(null);
		r.unmount();
		expect(ref.current).toBe(null);
		expect(r.container.innerHTML).toBe('');
	});
});

// The promotion cases: an anchorless slot whose value flips mode must mint its
// marker pair IN PLACE — content stays between the fixture's <b>A</b>/<b>B</b>
// siblings — and flipping back to a host renders correctly in the (now marked)
// regime. `section.textContent` proves both content and document order.
describe('anchorless → marked promotion on mode flips', () => {
	function flipRoundTrip(mode: string, expected: string, target?: HTMLElement) {
		const r = mount(App, { mode: 'host', target });
		expect(r.find('section').textContent).toBe('AhostB');
		expect(r.container.querySelector('#host')).not.toBe(null);

		r.update(App, { mode, target });
		expect(r.container.querySelector('#host')).toBe(null); // old node swept
		expect(r.find('section').textContent).toBe(expected);

		r.update(App, { mode: 'host', target });
		expect(r.find('section').textContent).toBe('AhostB');
		expect(r.container.querySelector('#host')).not.toBe(null);
		r.unmount();
	}

	it('host → text → host', () => flipRoundTrip('text', 'AplainB'));
	it('host → null → host', () => flipRoundTrip('null', 'AB'));
	it('host → keyed array → host', () => flipRoundTrip('array', 'AabB'));

	// Return-slot KIND flip: childSlot (anchorless host) ⇄ componentSlotSlot
	// (singleRoot `<Solo/>`) — exercises disposeReturnSlot's teardown of an
	// anchorless childSlot (no markers to sweep; the node itself is removed).
	it('host → singleRoot component → host', () => flipRoundTrip('comp', 'AsoloB'));

	// Host WITH component children needs Blocks → the component path, not the
	// raw reconciler; the anchorless slot promotes and mounts it as a Block.
	it('host → host-with-component-children → host', () => flipRoundTrip('hostcomp', 'AdeepB'));

	it('host → portal → host (content moves to the foreign target and back)', () => {
		const target = document.createElement('aside');
		document.body.appendChild(target);
		try {
			const r = mount(App, { mode: 'host', target });
			expect(r.find('section').textContent).toBe('AhostB');

			r.update(App, { mode: 'portal', target });
			expect(r.container.querySelector('#host')).toBe(null);
			expect(r.find('section').textContent).toBe('AB'); // slot itself is empty
			expect(target.querySelector('.solo')!.textContent).toBe('portal');

			r.update(App, { mode: 'host', target });
			expect(target.querySelector('.solo')).toBe(null); // portal torn down
			expect(r.find('section').textContent).toBe('AhostB');
			r.unmount();
		} finally {
			target.remove();
		}
	});
});
