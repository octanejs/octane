import { BehaviorSubject, config, Observable, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { bind, shareLatest, state } from '@octanejs/rxjs';
import { createSignal } from '@octanejs/rxjs/utils';
import { mount, nextPaint } from './_helpers';
import {
	ObservableErrorBoundary,
	Reader,
	SourceSubscriber,
	StableSubscriptionReader,
	SubscribeReader,
} from './_fixtures/reader.tsrx';

describe('@octanejs/rxjs', () => {
	it('renders the current value and tracks later emissions', async () => {
		const source = new BehaviorSubject(1);
		const view = mount(Reader, { source });
		await nextPaint();
		expect(view.find('#value').textContent).toBe('1');

		source.next(2);
		await nextPaint();
		expect(view.find('#value').textContent).toBe('2');
		view.unmount();
	});

	it('preserves the bind and state contracts', () => {
		const [useBound, bound] = bind(of(1), 0);
		expect(typeof useBound).toBe('function');
		expect(bound.getValue()).toBe(0);
		expect(state(of(2), 1).getValue()).toBe(1);
	});

	it('shares and replays one source subscription', () => {
		let subscriptions = 0;
		const source = new Observable<number>((subscriber) => {
			subscriptions++;
			subscriber.next(1);
		}).pipe(shareLatest());
		const a = source.subscribe();
		const b = source.subscribe();
		expect(subscriptions).toBe(1);
		a.unsubscribe();
		b.unsubscribe();
	});

	it('exports framework-neutral utilities from the utils subpath', () => {
		const [value$, emit] = createSignal<number>();
		const values: number[] = [];
		const subscription = value$.subscribe((value) => values.push(value));
		emit(3);
		expect(values).toEqual([3]);
		subscription.unsubscribe();
	});

	it('establishes an eager source subscription before rendering children', async () => {
		const source = new BehaviorSubject(4);
		const view = mount(SubscribeReader, { source });
		await nextPaint();
		expect(view.find('#value').textContent).toBe('4');
		view.unmount();
	});

	it('does not report owned source errors as unhandled', async () => {
		const unhandledErrors: unknown[] = [];
		const previousHandler = config.onUnhandledError;
		config.onUnhandledError = (error) => unhandledErrors.push(error);
		const source = new Observable((subscriber) => {
			queueMicrotask(() => subscriber.error(new Error('source failed')));
		});
		const view = mount(SourceSubscriber, { source });

		try {
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(unhandledErrors).toEqual([]);
		} finally {
			view.unmount();
			config.onUnhandledError = previousHandler;
		}
	});

	it('keeps the store subscribe callback stable across unrelated renders', async () => {
		let subscriptions = 0;
		const source = new Observable<number>((subscriber) => {
			subscriptions++;
			subscriber.next(8);
		});
		const view = mount(StableSubscriptionReader, { source });
		await nextPaint();
		expect(subscriptions).toBe(1);

		view.click('#rerender');
		await nextPaint();
		expect(subscriptions).toBe(1);
		view.unmount();
	});

	it('routes asynchronous observable errors through an Octane boundary', async () => {
		const source = new BehaviorSubject(1);
		const view = mount(ObservableErrorBoundary, { source });
		await nextPaint();
		source.error(new Error('observable failed'));
		for (let i = 0; i < 4; i++) {
			await new Promise((resolve) => setTimeout(resolve, 0));
			await nextPaint();
		}
		expect(view.find('#observable-error').textContent).toBe('observable failed');
		view.unmount();
	});

	it('clears an observable error when the source changes', async () => {
		const failed = new BehaviorSubject(1);
		const view = mount(ObservableErrorBoundary, { source: failed });
		await nextPaint();
		failed.error(new Error('observable failed'));
		view.update(ObservableErrorBoundary, { source: new BehaviorSubject(2) });
		await nextPaint();
		expect(view.find('#value').textContent).toBe('2');
		view.unmount();
	});
});
