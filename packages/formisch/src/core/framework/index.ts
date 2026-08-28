/*
 * Vendored from Formisch 1.0.0-rc.0, commit
 * 4c494fd8cf105efd04a4b179e9c090595a0bf041.
 * This is the React-generated signal protocol with an Octane framework tag.
 */
import type { Signal } from '../types/signal/index.ts';

export type Framework =
	'angular' | 'octane' | 'preact' | 'qwik' | 'react' | 'solid' | 'svelte' | 'vue';

export const framework: Framework = 'octane';

// @__NO_SIDE_EFFECTS__
export function createId(): string {
	return Math.random().toString(36).slice(2);
}

export type Listener = [() => void, Set<Set<Listener>>];

let listener: Listener | undefined;

export function setListener(newListener: Listener | undefined): void {
	listener = newListener;
}

let batchSubscribers: Set<Listener> | undefined;

// @__NO_SIDE_EFFECTS__
export function createSignal<T>(value: T): Signal<T> {
	const subscribers = new Set<Listener>();
	return {
		get value() {
			if (listener) {
				subscribers.add(listener);
				listener[1].add(subscribers);
			}
			return value;
		},
		set value(newValue: T) {
			if (newValue !== value) {
				value = newValue;
				const localSubscribers: Listener[] = [];
				for (const subscriber of subscribers) {
					if (batchSubscribers) batchSubscribers.add(subscriber);
					else localSubscribers.push(subscriber);
					subscriber[1].delete(subscribers);
				}
				subscribers.clear();
				for (const subscriber of localSubscribers) subscriber[0]();
			}
		},
	};
}

let batchDepth = 0;

export function batch<T>(fn: () => T): T {
	batchDepth++;
	batchSubscribers ??= new Set();
	try {
		return fn();
	} finally {
		batchDepth--;
		if (batchDepth === 0) {
			const subscribers = batchSubscribers;
			batchSubscribers = undefined;
			for (const subscriber of subscribers) subscriber[0]();
		}
	}
}

export function untrack<T>(fn: () => T): T {
	const previousListener = listener;
	listener = undefined;
	try {
		return fn();
	} finally {
		listener = previousListener;
	}
}
