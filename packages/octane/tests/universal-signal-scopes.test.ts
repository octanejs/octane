import { afterEach, describe, expect, it } from 'vitest';
import {
	createObjectContainer,
	createObjectDriver,
	createUniversalRoot,
	type ObjectHostInstance,
	type UniversalHostBatch,
} from '../src/universal.js';
import {
	EventHandle,
	Family,
	HiddenLocal,
	Local,
	MaybeLocal,
	Restyled,
	activity,
	locals2,
	restyle,
	shown,
	Scoped,
	Styled,
	color$,
	gap$,
	locals,
	renders,
	rows,
	scopedCount$,
} from './_fixtures/universal-signal-scopes.object.tsrx';
import {
	LocalOnly,
	handles,
	localRenders,
} from './_fixtures/universal-signal-local-only.object.tsrx';

function text(parent: { readonly children: readonly ObjectHostInstance[] }): string {
	let output = '';
	for (const child of parent.children)
		output += child.type === '#text' ? String(child.props.value) : text(child);
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
	scopedCount$.set(1);
	rows.get(2).set(20);
	color$.set('red');
	gap$.set(4);
	renders.local = renders.scoped = renders.family = renders.styled = 0;
});

describe('universal signal scopes', () => {
	it('binds a useSignal$ handle and updates it without rendering again', async () => {
		const { container, root, batches } = mountObject(Local);
		unmount = () => root.unmount();
		expect(text(container)).toBe('0');
		expect(container.children[0].props.count).toBe(0);
		const before = batches.length;
		locals.set!(5);
		await microtask();
		expect(text(container)).toBe('5');
		expect(container.children[0].props.count).toBe(5);
		expect(renders.local).toBe(1);
		expect(batches.length).toBe(before + 1);
		expect(batches.at(-1)!.commands.map((c) => c.op)).toEqual(['update', 'update']);
	});

	it('binds a createScope signal', async () => {
		const { container, root, batches } = mountObject(Scoped);
		unmount = () => root.unmount();
		expect(text(container)).toBe('1');
		const before = batches.length;
		scopedCount$.set(7);
		await microtask();
		expect(text(container)).toBe('7');
		expect(renders.scoped).toBe(1);
		expect(batches.length).toBe(before + 1);
	});

	it('binds a createFamily member', async () => {
		const { container, root, batches } = mountObject(Family);
		unmount = () => root.unmount();
		expect(text(container)).toBe('20');
		const before = batches.length;
		rows.get(2).set(21);
		await microtask();
		expect(text(container)).toBe('21');
		expect(renders.family).toBe(1);
		expect(batches.length).toBe(before + 1);
	});

	it('binds signal handles inside a style object', async () => {
		const { container, root, batches } = mountObject(Styled);
		unmount = () => root.unmount();
		expect(container.children[0].props.style).toEqual({ color: 'red', gap: 4, padding: 2 });
		const before = batches.length;
		color$.set('blue');
		gap$.set(8);
		await microtask();
		expect(container.children[0].props.style).toEqual({ color: 'blue', gap: 8, padding: 2 });
		expect(renders.styled).toBe(1);
		expect(batches.length).toBe(before + 1);
		expect(batches.at(-1)!.commands).toEqual([
			expect.objectContaining({
				op: 'update',
				props: { style: { color: 'blue', gap: 8, padding: 2 } },
			}),
		]);
	});
});

describe('universal useSignal$ lifetime', () => {
	it('disposes the local signal when the component unmounts', async () => {
		const { container, root } = mountObject(MaybeLocal);
		unmount = () => root.unmount();
		expect(text(container)).toBe('3');
		const handle = locals2.handle!;
		expect(handle.get()).toBe(3);
		shown.set!(false);
		await microtask();
		await microtask();
		expect(text(container)).toBe('');
		expect(() => handle.get()).toThrow();
	});

	it('keeps the local signal while an Activity hides the component', async () => {
		const { container, root } = mountObject(HiddenLocal);
		unmount = () => root.unmount();
		const handle = locals2.handle! as { get(): number; set(n: number): void };
		handle.set(9);
		await microtask();
		expect(text(container)).toBe('9');
		activity.set!('hidden');
		await microtask();
		await microtask();
		expect(handle.get()).toBe(9);
		activity.set!('visible');
		await microtask();
		await microtask();
		expect(locals2.handle).toBe(handle);
		expect(text(container)).toBe('9');
	});
});

describe('universal style bindings', () => {
	it('keeps the style bound after the component renders again', async () => {
		const { container, root, batches } = mountObject(Restyled);
		unmount = () => root.unmount();
		restyle.set!(6);
		await microtask();
		await microtask();
		expect(container.children[0].props.style).toEqual({ color: 'red', padding: 6 });
		const before = batches.length;
		const rendersBefore = renders.styled;
		color$.set('green');
		await microtask();
		expect(container.children[0].props.style).toEqual({ color: 'green', padding: 6 });
		expect(renders.styled).toBe(rendersBefore);
		expect(batches.length).toBe(before + 1);
		expect(batches.at(-1)!.commands).toHaveLength(1);
	});
});

describe('universal useSignal$ in a module importing only octane/signals/client', () => {
	it('binds the local signal without rendering again', async () => {
		const { container, root, batches } = mountObject(LocalOnly);
		unmount = () => root.unmount();
		expect(text(container)).toBe('1');
		const before = batches.length;
		handles.local!.set(2);
		await microtask();
		expect(text(container)).toBe('2');
		expect(localRenders.count).toBe(1);
		expect(batches.length).toBe(before + 1);
		expect(batches.at(-1)!.commands).toHaveLength(1);
	});
});

describe('universal signal handles on event props', () => {
	it('rejects a handle as a host event handler with the function to write instead', () => {
		expect(() => mountObject(EventHandle)).toThrow(
			/signal handle cannot be the host event handler onPress.*onPress=\{\(event\) => handler\$\.get\(\)\(event\)\}/,
		);
	});
});
