import { describe, expect, it } from 'vitest';
import { createElement, flushSync, hostComponent, type ComponentBody } from '../src/index.js';
import { act, mount } from './_helpers';
import {
	CompiledSiblings,
	RefPostorderBatch,
	type SiblingProps,
} from './_fixtures/ref-postorder-batches.tsrx';

it('attaches child refs before parent refs while preserving sibling branch order', async () => {
	const log: string[] = [];
	const props = { log: (entry: string) => log.push(entry), label: 'initial' };
	const r = mount(RefPostorderBatch, props);
	try {
		await act(() => {});
		expect(r.html()).toBe(
			'<main><section><span>first initial</span><span>second initial</span></section><aside><span>deep initial</span></aside></main>',
		);
		expect(log).toEqual([
			'first initial',
			'second initial',
			'first parent',
			'deep initial',
			'second parent',
		]);
		const first = r.find('section span');
		log.length = 0;
		r.update(RefPostorderBatch, { ...props, label: 'updated' });
		await act(() => {});
		expect(r.find('section span')).toBe(first);
		expect(r.html()).toBe(
			'<main><section><span>first updated</span><span>second updated</span></section><aside><span>deep updated</span></aside></main>',
		);
		expect(log).toEqual([
			'first updated',
			'second updated',
			'first parent',
			'deep updated',
			'second parent',
		]);
	} finally {
		r.unmount();
	}
});

// React attaches refs in its layout phase in tree order, whether the host is
// fresh or committed. A committed host writes its props at commit; a ref
// change it makes there must still attach in its place in the tree.

function DeoptSiblings(props: SiblingProps) {
	return createElement(
		'form',
		null,
		createElement('p', null, props.show ? createElement('input', { ref: props.first }) : null),
		createElement('input', { type: 'checkbox', ...props.bind }),
	);
}

const Registered: ComponentBody<{ bind: Record<string, unknown> }> = (props, scope) => {
	hostComponent(scope, 0, 'input', { type: 'checkbox', ...props.bind }, null);
};

function HostComponentSiblings(props: SiblingProps) {
	return createElement(
		'form',
		null,
		createElement('p', null, props.show ? createElement('input', { ref: props.first }) : null),
		createElement(Registered as any, { bind: props.bind }),
	);
}

const siblings: [string, (props: SiblingProps) => any][] = [
	['a compiled spread host', CompiledSiblings],
	['a de-opt descriptor host', DeoptSiblings],
	['a hostComponent', HostComponentSiblings],
];

describe.each(siblings)("a committed host's changed ref attaches in tree order (%s)", (_, App) => {
	it('attaches after a fresh host that precedes it', () => {
		const attached: string[] = [];
		const ref = (name: string) => (el: Element | null) => {
			if (el !== null) attached.push(name);
		};
		const m = mount(App as any, { show: false, first: ref('first'), bind: { ref: ref('old') } });
		expect(attached).toEqual(['old']);

		attached.length = 0;
		m.root.render(App as any, { show: true, first: ref('first'), bind: { ref: ref('new') } });
		flushSync(() => {});
		expect(attached).toEqual(['first', 'new']);
		m.unmount();
	});
});

// react-hook-form's `register(name)` returns a new ref every render, and its
// ref callback writes the field's value to every checkbox still connected
// under that name. Inserting a row renames the rows after it, so a committed
// row that registers before the inserted one writes a stale value into it.
function checkboxForm(values: boolean[]) {
	const fields = new Map<string, HTMLInputElement[]>();
	const attached: number[] = [];
	const bind = (index: number) => {
		const name = 'row.' + index;
		return {
			name,
			ref(el: HTMLInputElement | null) {
				if (el === null) return;
				attached.push(index);
				const refs = fields.get(name) ?? [];
				if (refs.includes(el)) return;
				const next = [...refs.filter((ref) => ref.isConnected), el];
				fields.set(name, next);
				for (const ref of next) ref.checked = values[index];
			},
		};
	};
	return { values, attached, bind };
}

interface RowProps {
	rows: string[];
	bind: (index: number) => Record<string, unknown>;
}

function DeoptRows(props: RowProps) {
	return createElement(
		'form',
		null,
		props.rows.map((row, i) =>
			createElement(
				'label',
				{ key: row },
				createElement('span', null, row),
				createElement('input', { type: 'checkbox', ...props.bind(i) }),
			),
		),
	);
}

describe('keyed de-opt checkbox rows', () => {
	it('register an inserted row in tree order, so each checkbox shows its own value', () => {
		const form = checkboxForm([true, false]);
		const m = mount(DeoptRows as any, { rows: ['a', 'b'], bind: form.bind });
		const checked = () => m.findAll('input').map((input) => (input as HTMLInputElement).checked);
		expect(checked()).toEqual([true, false]);

		form.attached.length = 0;
		form.values.splice(1, 0, true);
		m.root.render(DeoptRows as any, { rows: ['a', 'x', 'b'], bind: form.bind });
		flushSync(() => {});

		expect(form.attached).toEqual([0, 1, 2]);
		expect(checked()).toEqual([true, true, false]);
		m.unmount();
	});
});
