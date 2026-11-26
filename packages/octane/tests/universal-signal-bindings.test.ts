import { afterEach, describe, expect, it } from 'vitest';
import {
	createObjectContainer,
	createObjectDriver,
	createUniversalRoot,
	type ObjectHostInstance,
	type UniversalHostBatch,
	universalScopedClass,
} from '../src/universal.js';
import {
	Counter,
	Forwarded,
	Gated,
	Reader,
	Rows,
	ScopedTone,
	cells,
	gate$,
	renders,
	ticks$,
	tone$,
} from './_fixtures/universal-signal-bindings.object.tsrx';

function text(parent: { readonly children: readonly ObjectHostInstance[] }): string {
	let output = '';
	for (const child of parent.children) {
		output += child.type === '#text' ? String(child.props.value) : text(child);
	}
	return output;
}

function mountObject(component: unknown) {
	const container = createObjectContainer();
	const driver = createObjectDriver();
	const batches: UniversalHostBatch[] = [];
	const prepareBatch = driver.prepareBatch.bind(driver);
	driver.prepareBatch = (target, batch, context) => {
		batches.push(batch);
		return prepareBatch(target, batch, context);
	};
	const root = createUniversalRoot(container, driver);
	root.render(component as never, undefined);
	return { container, root, batches };
}

const microtask = () => new Promise<void>((resolve) => queueMicrotask(resolve));

let unmount: (() => void) | null = null;

afterEach(() => {
	unmount?.();
	unmount = null;
	ticks$.set(0);
	gate$.set(true);
	tone$.set('calm');
	cells.forEach((cell, index) => cell.set(index));
	renders.counter = renders.row = renders.reader = 0;
});

describe('universal signal bindings', () => {
	it('mounts a host prop and a text child bound to signals with their current values', () => {
		ticks$.set(3);
		const { container, root } = mountObject(Counter);
		unmount = () => root.unmount();
		const view = container.children[0];
		expect(view.props.tone).toBe('calm');
		expect(text(container)).toBe('Ticks: 3');
	});

	it('updates only the bound host on a write, without rendering the component again', async () => {
		const { container, root, batches } = mountObject(Counter);
		unmount = () => root.unmount();
		const rendersAfterMount = renders.counter;
		const batchesAfterMount = batches.length;
		ticks$.set(1);
		await microtask();
		expect(text(container)).toBe('Ticks: 1');
		expect(renders.counter).toBe(rendersAfterMount);
		expect(batches.length).toBe(batchesAfterMount + 1);
		expect(batches.at(-1)!.commands).toEqual([
			expect.objectContaining({ op: 'update', props: { value: '1' } }),
		]);
	});

	it('coalesces writes in the same task into one batch with the last value', async () => {
		const { container, root, batches } = mountObject(Counter);
		unmount = () => root.unmount();
		const batchesAfterMount = batches.length;
		ticks$.set(1);
		ticks$.set(2);
		tone$.set('loud');
		await microtask();
		expect(batches.length).toBe(batchesAfterMount + 1);
		expect(batches.at(-1)!.commands.map((command) => command.op)).toEqual(['update', 'update']);
		expect(text(container)).toBe('Ticks: 2');
		expect(container.children[0].props.tone).toBe('loud');
		expect(renders.counter).toBe(1);
	});

	it('changes one row of a list with a single update command', async () => {
		const { container, root, batches } = mountObject(Rows);
		unmount = () => root.unmount();
		expect(text(container)).toBe('0123');
		const batchesAfterMount = batches.length;
		cells[2].set(20);
		await microtask();
		expect(text(container)).toBe('01203');
		expect(batches.length).toBe(batchesAfterMount + 1);
		const commands = batches.at(-1)!.commands;
		expect(commands.every((command) => command.op === 'update')).toBe(true);
		expect(commands).toHaveLength(2);
		expect(container.children[0].children[2].props.value).toBe(20);
	});

	it('stops updating a host after unmount', async () => {
		const { root, batches } = mountObject(Counter);
		root.unmount();
		const batchesAfterUnmount = batches.length;
		ticks$.set(5);
		await microtask();
		expect(batches.length).toBe(batchesAfterUnmount);
	});

	it('renders a component again when a signal its render read changes', async () => {
		const { container, root } = mountObject(Reader);
		unmount = () => root.unmount();
		expect(text(container)).toBe('0');
		ticks$.set(4);
		await microtask();
		await microtask();
		expect(text(container)).toBe('8');
		expect(renders.reader).toBe(2);
	});
});

describe('universal signal bindings through props and derived values', () => {
	it('binds a derived handle forwarded through a component to host props and text', async () => {
		const { container, root, batches } = mountObject(Forwarded);
		unmount = () => root.unmount();
		expect(text(container)).toBe('0');
		const batchesAfterMount = batches.length;
		ticks$.set(21);
		await microtask();
		expect(text(container)).toBe('42');
		expect(container.children[0].children[0].props.label).toBe(42);
		expect(renders.counter).toBe(1);
		expect(batches.length).toBe(batchesAfterMount + 1);
	});

	it('drops the subscription to a signal a later render no longer reads', async () => {
		const { container, root } = mountObject(Gated);
		unmount = () => root.unmount();
		expect(text(container)).toBe('0');
		gate$.set(false);
		await microtask();
		await microtask();
		expect(text(container)).toBe('off');
		const rendersWhenOff = renders.reader;
		ticks$.set(9);
		await microtask();
		await microtask();
		expect(renders.reader).toBe(rendersWhenOff);
		gate$.set(true);
		await microtask();
		await microtask();
		expect(text(container)).toBe('9');
	});
});

describe('universal scoped classes over signals', () => {
	it('appends scope classes to a plain class value', () => {
		expect(universalScopedClass(['a', { b: true }], 'scope-a')).toBe('a b scope-a');
	});

	it('binds a class handle with the scope classes appended', async () => {
		const { container, root, batches } = mountObject(ScopedTone);
		unmount = () => root.unmount();
		expect(container.children[0].props.class).toBe('calm scope-a');
		const batchesAfterMount = batches.length;
		tone$.set('loud');
		await microtask();
		expect(container.children[0].props.class).toBe('loud scope-a');
		expect(batches.length).toBe(batchesAfterMount + 1);
		expect(renders.counter).toBe(1);
	});
});
