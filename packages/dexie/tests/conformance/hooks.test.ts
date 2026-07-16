import { describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { flushEffects, mount, nextPaint } from '../_helpers';
import {
	DocumentReader,
	FactoryReader,
	ObservableReader,
	TwoReaders,
} from '../_fixtures/observable.tsrx';

class TestObservable {
	listeners = new Set<(value: string) => void>();
	unsubscribeCount = 0;

	subscribe(onNext: (value: string) => void, _onError?: (error: unknown) => void) {
		this.listeners.add(onNext);
		return () => {
			this.listeners.delete(onNext);
			this.unsubscribeCount++;
		};
	}

	emit(value: string) {
		for (const listener of [...this.listeners]) listener(value);
	}
}

describe('@octanejs/dexie hooks', () => {
	it('returns the default and updates from observable emissions', async () => {
		const observable = new TestObservable();
		const result = mount(ObservableReader, { observable });

		expect(result.find('#value').textContent).toBe('loading');
		flushEffects();
		observable.emit('ready');
		await nextPaint();
		expect(result.find('#value').textContent).toBe('ready');

		result.unmount();
		expect(observable.unsubscribeCount).toBe(1);
	});

	it('keeps multiple hook call sites independent', async () => {
		const first = new TestObservable();
		const second = new TestObservable();
		const result = mount(TwoReaders, { first, second });

		flushEffects();
		first.emit('one');
		await nextPaint();
		expect(result.find('#left').textContent).toBe('one');
		expect(result.find('#right').textContent).toBe('right');

		second.emit('two');
		await nextPaint();
		expect(result.find('#left').textContent).toBe('one');
		expect(result.find('#right').textContent).toBe('two');
		result.unmount();
	});

	it('resubscribes when the observable prop changes', async () => {
		const first = new TestObservable();
		const second = new TestObservable();
		const result = mount(FactoryReader, { observable: first, version: 0 });

		result.update(FactoryReader, { observable: second, version: 1 });
		flushEffects();
		first.emit('stale');
		second.emit('current');
		await nextPaint();

		expect(result.find('#value').textContent).toBe('current');
		expect(first.listeners.size).toBe(0);
		expect(second.listeners.size).toBe(1);
		result.unmount();
	});

	it('loads and releases optional y-dexie document providers', () => {
		const docs = new Map<object, { doc: object }>();
		const released: object[] = [];
		const provider = {
			load(doc: object) {
				const value = { doc };
				docs.set(doc, value);
				return value;
			},
			for(doc: object) {
				return docs.get(doc);
			},
			release(doc: object) {
				released.push(doc);
				docs.delete(doc);
			},
		};
		const dexieWithProvider = Dexie as typeof Dexie & { DexieYProvider?: typeof provider };
		const previous = dexieWithProvider.DexieYProvider;
		dexieWithProvider.DexieYProvider = provider;
		try {
			const first = { id: 'first' };
			const second = { id: 'second' };
			const result = mount(DocumentReader, { doc: first });
			flushEffects();
			expect(result.find('#document').textContent).toBe('first');

			result.update(DocumentReader, { doc: second });
			flushEffects();
			expect(result.find('#document').textContent).toBe('second');
			expect(released).toEqual([first]);

			result.unmount();
			flushEffects();
			expect(released).toEqual([first, second]);
		} finally {
			dexieWithProvider.DexieYProvider = previous;
		}
	});

	it('reports a clear error when the optional provider is unavailable', () => {
		const dexieWithProvider = Dexie as typeof Dexie & { DexieYProvider?: unknown };
		const previous = dexieWithProvider.DexieYProvider;
		delete dexieWithProvider.DexieYProvider;
		try {
			expect(() => mount(DocumentReader, { doc: { id: 'missing-provider' } })).toThrow(
				/DexieYProvider is not available/,
			);
		} finally {
			dexieWithProvider.DexieYProvider = previous;
		}
	});

	it('releases a document when the hook receives null', () => {
		const docs = new Map<object, { doc: object }>();
		const released: object[] = [];
		const provider = {
			load(doc: object) {
				const value = { doc };
				docs.set(doc, value);
				return value;
			},
			for(doc: object) {
				return docs.get(doc);
			},
			release(doc: object) {
				released.push(doc);
				docs.delete(doc);
			},
		};
		const dexieWithProvider = Dexie as typeof Dexie & { DexieYProvider?: typeof provider };
		const previous = dexieWithProvider.DexieYProvider;
		dexieWithProvider.DexieYProvider = provider;
		try {
			const doc = { id: 'clear-me' };
			const result = mount(DocumentReader, { doc });
			flushEffects();
			result.update(DocumentReader, { doc: null });
			flushEffects();
			expect(result.find('#document').textContent).toBe('');
			expect(released).toEqual([doc]);
			result.unmount();
			flushEffects();
		} finally {
			dexieWithProvider.DexieYProvider = previous;
		}
	});

	// Per Bugbot discussion_r3597912063: same-doc re-renders must not flip effect
	// deps via a render-local unregisterToken and spuriously release ownership.
	it('does not release a document when re-rendering with the same doc identity', () => {
		const docs = new Map<object, { doc: object }>();
		const released: object[] = [];
		const provider = {
			load(doc: object) {
				const value = { doc };
				docs.set(doc, value);
				return value;
			},
			for(doc: object) {
				return docs.get(doc);
			},
			release(doc: object) {
				released.push(doc);
				docs.delete(doc);
			},
		};
		const dexieWithProvider = Dexie as typeof Dexie & { DexieYProvider?: typeof provider };
		const previous = dexieWithProvider.DexieYProvider;
		dexieWithProvider.DexieYProvider = provider;
		try {
			const doc = { id: 'stable' };
			const result = mount(DocumentReader, { doc, nonce: 0 });
			flushEffects();
			expect(result.find('#document').textContent).toBe('stable');
			expect(released).toEqual([]);

			result.update(DocumentReader, { doc, nonce: 1 });
			flushEffects();
			expect(result.find('#document').textContent).toBe('stable');
			expect(released).toEqual([]);

			result.unmount();
			flushEffects();
			expect(released).toEqual([doc]);
		} finally {
			dexieWithProvider.DexieYProvider = previous;
		}
	});
});
