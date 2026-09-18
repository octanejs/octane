import { test, expect } from 'vitest';
import { createSignal, createEffect, createMemo, batch, createStore } from '../src/reactive.js';

// Detached createEffect defers its first run to a microtask (Solid parity);
// awaiting a resolved promise observes the completed initial pass.
const flushInitialEffects = () => Promise.resolve();

test('effect refires on signal change', async () => {
	const [v, setV] = createSignal(0);
	let runs = 0;
	let seen = -1;
	createEffect(() => {
		seen = v();
		runs++;
	});
	await flushInitialEffects();
	expect(runs).toBe(1);
	expect(seen).toBe(0);
	setV(1);
	expect(runs).toBe(2);
	expect(seen).toBe(1);
	setV(2);
	expect(runs).toBe(3);
	expect(seen).toBe(2);
});

test('memo recomputes and notifies', async () => {
	const [v, setV] = createSignal(1);
	const doubled = createMemo(() => v() * 2);
	let seen = -1;
	createEffect(() => {
		seen = doubled();
	});
	await flushInitialEffects();
	expect(seen).toBe(2);
	setV(5);
	expect(seen).toBe(10);
});

test('store notifies on path write', async () => {
	const [store, setStore] = createStore({ a: 1, nested: { b: 2 } });
	let seen = -1;
	createEffect(() => {
		seen = store.a;
	});
	await flushInitialEffects();
	setStore('a', 9);
	expect(seen).toBe(9);
	let seenB = -1;
	createEffect(() => {
		seenB = store.nested.b;
	});
	await flushInitialEffects();
	setStore('nested', 'b', 7);
	expect(seenB).toBe(7);
});

test('dispose stops effects', async () => {
	const [v, setV] = createSignal(0);
	let runs = 0;
	const dispose = createEffect(() => {
		v();
		runs++;
	});
	await flushInitialEffects();
	setV(1);
	expect(runs).toBe(2);
	dispose();
	setV(2);
	expect(runs).toBe(2);
});
