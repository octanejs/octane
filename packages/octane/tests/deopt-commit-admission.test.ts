import { describe, expect, it } from 'vitest';
import { createElement, use } from 'octane';
import { act, mount } from './_helpers';

type Item = { id: string; label: string };
type Props = {
	label: string;
	items: Item[];
	observe(label: string): void;
	promise?: Promise<string>;
};

function Later({ label, observe, promise }: Pick<Props, 'label' | 'observe' | 'promise'>) {
	observe(label);
	const result = promise ? use(promise) : 'ready';
	return createElement('footer', null, result);
}

function DescriptorChildren(props: Props) {
	// A plain createElement host tree intentionally exercises descriptor child
	// reconciliation. Only the footer needs a component Block.
	return createElement(
		'article',
		null,
		createElement(
			'main',
			{
				title: props.label,
				'aria-label': props.label,
				style: { color: props.label === 'A' ? 'red' : 'blue' },
			},
			props.items.map((item) =>
				createElement(
					'label',
					{ key: item.id, 'data-row': item.id, title: item.label },
					createElement('input', { defaultValue: item.label }),
					createElement('span', null, item.label),
				),
			),
		),
		createElement(Later, props),
	);
}

function view(container: Element) {
	const main = container.querySelector('main')!;
	return {
		main,
		title: main.getAttribute('title'),
		aria: main.getAttribute('aria-label'),
		color: main.style.color,
		text: main.textContent,
		rows: [...main.querySelectorAll('label')].map((row) => ({
			node: row,
			name: row.getAttribute('data-row'),
			title: row.getAttribute('title'),
			input: row.querySelector('input'),
			draft: row.querySelector('input')?.value,
		})),
	};
}

describe('descriptor host render admission', () => {
	it.each(['commit', 'retry', 'cancel'] as const)(
		'does not expose a raw host upgrade until its new descendant is admitted (%s)',
		async (outcome) => {
			let resolve!: (value: string) => void;
			const promise = new Promise<string>((done) => {
				resolve = done;
			});
			let inspect = false;
			const seen: Array<{ children: Node[]; html: string; draft: string }> = [];
			type UpgradeProps = { expanded: boolean; promise?: Promise<string> };
			function NewDescendant({ promise: read }: { promise?: Promise<string> }) {
				if (inspect) {
					const input = root.container.querySelector('input')!;
					seen.push({
						children: [...root.container.childNodes],
						html: root.container.innerHTML,
						draft: input.value,
					});
				}
				const text = read ? use(read) : 'ready';
				return createElement('output', null, text);
			}
			function Upgrade({ expanded, promise: read }: UpgradeProps) {
				return createElement(
					'div',
					{ title: expanded ? 'expanded' : 'original' },
					createElement('input', { key: 'editor', defaultValue: 'default' }),
					expanded && createElement(NewDescendant, { key: 'new', promise: read }),
				);
			}
			const root = mount(Upgrade, { expanded: false });
			try {
				const host = root.find('div');
				const input = root.find('input') as HTMLInputElement;
				input.value = 'draft';
				const applied = {
					children: [...root.container.childNodes],
					html: root.container.innerHTML,
					draft: 'draft',
				};
				inspect = true;
				await act(() =>
					root.root.render(Upgrade, {
						expanded: true,
						promise: outcome === 'commit' ? undefined : promise,
					}),
				);
				expect(seen.length).toBeGreaterThan(0);
				for (const during of seen) expect(during).toEqual(applied);
				inspect = false;
				if (outcome !== 'commit') {
					expect([...root.container.childNodes]).toEqual(applied.children);
					expect(root.container.innerHTML).toBe(applied.html);
					input.value = 'edited while held';
					if (outcome === 'cancel') await act(() => root.root.render(Upgrade, { expanded: false }));
					await act(() => resolve('resolved'));
				}
				expect(root.find('div')).toBe(host);
				expect(root.find('input')).toBe(input);
				expect(input.value).toBe(outcome === 'commit' ? 'draft' : 'edited while held');
				if (outcome === 'cancel') {
					expect(root.container.querySelector('output')).toBeNull();
					expect([...root.container.childNodes]).toEqual(applied.children);
					expect(root.container.innerHTML).toBe(applied.html);
				} else {
					expect(root.find('output').textContent).toBe(outcome === 'commit' ? 'ready' : 'resolved');
					expect(host.title).toBe('expanded');
				}
			} finally {
				root.unmount();
			}
			expect(root.container.childNodes).toHaveLength(0);
		},
	);

	it('keeps applied descriptor props and keyed children visible until later siblings have rendered', () => {
		let inspecting = false;
		const observed: Array<ReturnType<typeof view>> = [];
		const props: Props = {
			label: 'A',
			items: [
				{ id: 'keep', label: 'first' },
				{ id: 'drop', label: 'second' },
			],
			observe() {
				if (inspecting) observed.push(view(root.container));
			},
		};
		const root = mount(DescriptorChildren, props);
		try {
			const input = root.find('input') as HTMLInputElement;
			input.value = 'private draft';
			const applied = view(root.container);
			expect(applied.rows.map((row) => row.name)).toEqual(['keep', 'drop']);
			expect(applied.title).toBe('A');
			inspecting = true;
			root.update(DescriptorChildren, {
				...props,
				label: 'B',
				items: [
					{ id: 'added', label: 'third' },
					{ id: 'keep', label: 'changed' },
				],
			});
			expect(observed.length).toBeGreaterThan(0);
			for (const duringRender of observed) expect(duringRender).toEqual(applied);
			const accepted = view(root.container);
			expect(accepted.main).toBe(applied.main);
			expect([accepted.title, accepted.aria, accepted.color, accepted.text]).toEqual([
				'B',
				'B',
				'blue',
				'thirdchanged',
			]);
			expect(accepted.rows.map((row) => row.name)).toEqual(['added', 'keep']);
			expect(accepted.rows[1]!.node).toBe(applied.rows[0]!.node);
			expect(accepted.rows[1]!.input).toBe(input);
			expect(input.value).toBe('private draft');
			expect(applied.rows[1]!.node.isConnected).toBe(false);
		} finally {
			root.unmount();
		}
	});

	it('abandons suspended descriptor children without publishing them over an edited survivor', async () => {
		let inspecting = false;
		let resolve!: (value: string) => void;
		const promise = new Promise<string>((done) => {
			resolve = done;
		});
		const observed: Array<ReturnType<typeof view>> = [];
		const props: Props = {
			label: 'A',
			items: [{ id: 'keep', label: 'original' }],
			observe() {
				if (inspecting) observed.push(view(root.container));
			},
		};
		const root = mount(DescriptorChildren, props);
		try {
			const input = root.find('input') as HTMLInputElement;
			input.value = 'draft before suspension';
			const applied = view(root.container);
			inspecting = true;
			await act(() =>
				root.root.render(DescriptorChildren, {
					...props,
					label: 'B',
					items: [{ id: 'other', label: 'uncommitted' }],
					promise,
				}),
			);
			expect(observed.length).toBeGreaterThan(0);
			for (const duringRender of observed) expect(duringRender).toEqual(applied);
			expect(view(root.container)).toEqual(applied);
			input.value = 'draft while held';
			inspecting = false;
			await act(() => root.root.render(DescriptorChildren, props));
			await act(() => resolve('obsolete'));
			const accepted = view(root.container);
			expect(accepted.main).toBe(applied.main);
			expect(accepted.rows.map((row) => row.name)).toEqual(['keep']);
			expect(accepted.rows[0]!.node).toBe(applied.rows[0]!.node);
			expect(accepted.rows[0]!.input).toBe(input);
			expect(input.value).toBe('draft while held');
			expect(root.find('footer').textContent).toBe('ready');
		} finally {
			root.unmount();
		}
	});
});
