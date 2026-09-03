import { describe, expect, it, vi } from 'vitest';
import { flushEffects, mount, nextPaint } from '../_helpers';
import {
	ExplicitObservableDefaults,
	FactorySymbolDefault,
	LiveQuerySymbolDefault,
	ObservableSymbolDefault,
} from '../_fixtures/symbol-default.tsrx';

class Observable {
	listeners = new Set<(value: string) => unknown>();

	subscribe(onNext: (value: string) => unknown) {
		this.listeners.add(onNext);
		return () => {
			this.listeners.delete(onNext);
		};
	}

	emit(value: string) {
		for (const listener of this.listeners) listener(value);
	}
}

describe('Dexie Symbol default results', () => {
	it.each([
		['observable', ObservableSymbolDefault],
		['observable factory', FactorySymbolDefault],
	] as const)('preserves a %s default until a value arrives', async (_, Reader) => {
		const observable = new Observable();
		const defaultResult = Symbol('loading');
		const root = mount(Reader, { observable, defaultResult });
		try {
			expect(root.find('output').textContent).toBe(String(defaultResult));
			flushEffects();
			observable.emit('ready');
			await nextPaint();
			expect(root.find('output').textContent).toBe('ready');
		} finally {
			root.unmount();
		}
		expect(observable.listeners.size).toBe(0);
	});

	it('preserves a live query default until the query resolves', async () => {
		let resolve!: (value: string) => void;
		const promise = new Promise<string>((done) => {
			resolve = done;
		});
		const defaultResult = Symbol('loading');
		const root = mount(LiveQuerySymbolDefault, { querier: () => promise, defaultResult });
		try {
			expect(root.find('output').textContent).toBe(String(defaultResult));
			flushEffects();
			resolve('loaded');
			await vi.waitFor(() => expect(root.find('output').textContent).toBe('loaded'));
		} finally {
			root.unmount();
		}
	});

	it('keeps manually identified observable calls independent', async () => {
		const first = new Observable();
		const second = new Observable();
		const root = mount(ExplicitObservableDefaults, { first, second });
		try {
			expect(root.find('#left').textContent).toBe('Symbol(left)');
			expect(root.find('#right').textContent).toBe('Symbol(right)');
			flushEffects();
			first.emit('one');
			await nextPaint();
			expect(root.find('#left').textContent).toBe('one');
			expect(root.find('#right').textContent).toBe('Symbol(right)');
			second.emit('two');
			await nextPaint();
			expect(root.find('#left').textContent).toBe('one');
			expect(root.find('#right').textContent).toBe('two');
		} finally {
			root.unmount();
		}
		expect(first.listeners.size).toBe(0);
		expect(second.listeners.size).toBe(0);
	});
});
