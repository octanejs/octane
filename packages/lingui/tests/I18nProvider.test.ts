import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@octanejs/testing-library';
import { createElement } from 'octane';
import { setupI18n } from '@lingui/core';
import { I18nProvider } from '../src/index.ts';
import {
	ComponentWithMemo,
	ComponentWithMemoizedI18n,
	CurrentLocaleChild,
	CurrentLocaleContextConsumer,
	CurrentLocaleStatic,
	DefaultComponentConsumer,
	GreetingConsumer,
	WithLinguiHook,
	WithoutLinguiHook,
	dynamicRenderCount,
	memoRenderCount,
	resetI18nFixtureCounts,
	staticRenderCount,
} from './_fixtures/i18n.tsrx';

afterEach(function resetDom() {
	cleanup();
	resetI18nFixtureCounts();
});

describe('I18nProvider', function i18nProviderSuite() {
	// Per packages/lingui/upstream/canonical/src/I18nProvider.test.tsx
	it(
		'should pass i18n context to wrapped components, ' +
			'and re-render components that consume the context through useLingui()',
		function contextRerenders() {
			const i18n = setupI18n({
				locale: 'en',
				messages: {
					en: {},
					cs: {},
				},
			});

			const { getByTestId } = render(
				createElement(
					I18nProvider,
					{ i18n },
					createElement(WithoutLinguiHook, { i18n, 'data-testid': 'static' }),
					createElement(WithLinguiHook, { 'data-testid': 'dynamic' }),
				),
			);

			act(function activateCs() {
				i18n.activate('cs');
			});

			expect(getByTestId('static').textContent).toEqual('en');
			expect(getByTestId('dynamic').textContent).toEqual('cs');

			act(function activateEn() {
				i18n.activate('en');
			});

			expect(getByTestId('static').textContent).toEqual('en');
			expect(getByTestId('dynamic').textContent).toEqual('en');
			expect(staticRenderCount).toEqual(1);
			expect(dynamicRenderCount).toEqual(3);
		},
	);

	it('should subscribe for locale changes upon mount', function subscribeOnMount() {
		const i18n = setupI18n({
			locale: 'cs',
			messages: {
				cs: {},
			},
		});
		i18n.on = vi.fn(function mockOn() {
			return vi.fn();
		});

		expect(i18n.on).not.toBeCalled();
		render(createElement(I18nProvider, { i18n }, createElement('div', null)));
		expect(i18n.on).toBeCalledWith('change', expect.any(Function));
	});

	it('should unsubscribe for locale changes on unmount', function unsubscribeOnUnmount() {
		const unsubscribe = vi.fn();
		const i18n = setupI18n({
			locale: 'cs',
			messages: {
				cs: {},
			},
		});
		i18n.on = vi.fn(function mockOn() {
			return unsubscribe;
		});

		const { unmount } = render(createElement(I18nProvider, { i18n }, createElement('div', null)));
		expect(unsubscribe).not.toBeCalled();
		unmount();
		expect(unsubscribe).toBeCalled();
	});

	it('I18nProvider renders `null` until locale is activated. Children are rendered after activation.', function nullUntilActivated() {
		expect.assertions(3);

		const i18n = setupI18n();

		const { container } = render(
			createElement(
				I18nProvider,
				{ i18n },
				createElement(CurrentLocaleStatic, { i18n }),
				createElement(CurrentLocaleContextConsumer, null),
			),
		);

		expect(container.textContent).toEqual('');

		act(function loadCs() {
			i18n.load('cs', {});
		});
		expect(container.textContent).toEqual('');

		act(function activateCs() {
			i18n.activate('cs');
		});

		expect(container.textContent).toEqual('1_cs2_cs');
	});

	it(
		"given 'en' locale, if activate('cs') call happens before i18n.on-change subscription is established, " +
			"I18nProvider detects that it's stale and re-renders with the 'cs' locale value",
		function staleSnapshot() {
			const i18n = setupI18n({
				locale: 'en',
				messages: { en: {} },
			});

			const mockSubscriber = vi.fn(function mockSubscriberImpl() {
				i18n.load('cs', {});
				i18n.activate('cs');
				return function unsubscriber() {};
			});
			vi.spyOn(i18n, 'on').mockImplementation(mockSubscriber);

			const { getByTestId } = render(
				createElement(I18nProvider, { i18n }, createElement(CurrentLocaleChild, null)),
			);

			expect(mockSubscriber).toHaveBeenCalledWith('change', expect.any(Function));

			expect(getByTestId('child').textContent).toBe('cs');
			expect(memoRenderCount).toBe(2);
		},
	);

	it('should render children', function renderChildren() {
		const i18n = setupI18n({
			locale: 'en',
			messages: { en: {} },
		});

		const child = createElement('div', { 'data-testid': 'child' });
		const { getByTestId } = render(createElement(I18nProvider, { i18n }, child));
		expect(getByTestId('child')).toBeTruthy();
	});

	it('using the _ function from useLingui renders fresh translations even when memoized', function memoizedUnderscore() {
		const greetingId = 'greeting';
		const i18n = setupI18n({
			locale: 'en',
			messages: {
				en: {
					[greetingId]: 'Hello World',
				},
				cs: {
					[greetingId]: 'Ahoj světe',
				},
			},
		});

		const { getByText } = render(
			createElement(I18nProvider, { i18n }, createElement(ComponentWithMemo, { greetingId })),
		);

		expect(getByText('Hello World')).toBeTruthy();

		act(function activateCs() {
			i18n.activate('cs');
		});

		expect(getByText('Ahoj světe')).toBeTruthy();
	});

	it('updates translations when active locale messages change', function messagesChange() {
		const greetingId = 'greeting';
		const i18n = setupI18n({
			locale: 'en',
			messages: {
				en: {
					[greetingId]: 'Hello World',
				},
			},
		});

		const { getByText } = render(
			createElement(I18nProvider, { i18n }, createElement(GreetingConsumer, { greetingId })),
		);

		expect(getByText('Hello World')).toBeTruthy();

		act(function loadEn() {
			i18n.load('en', {
				[greetingId]: 'Hi World',
			});
		});

		expect(getByText('Hi World')).toBeTruthy();
	});

	it('exposes defaultComponent through context and updates it when the prop changes', function defaultComponentUpdates() {
		const i18n = setupI18n({
			locale: 'en',
			messages: { en: {} },
		});

		function DefaultA() {
			return createElement('span', null, 'default-A');
		}
		function DefaultB() {
			return createElement('span', null, 'default-B');
		}

		const { getByText, rerender } = render(
			createElement(
				I18nProvider,
				{ i18n, defaultComponent: DefaultA },
				createElement(DefaultComponentConsumer, null),
			),
		);

		expect(getByText('default-A')).toBeTruthy();

		rerender(
			createElement(
				I18nProvider,
				{ i18n, defaultComponent: DefaultB },
				createElement(DefaultComponentConsumer, null),
			),
		);

		expect(getByText('default-B')).toBeTruthy();
	});

	it('keeps memoized useLingui().i18n locale in sync on locale change', function memoizedI18n() {
		const i18n = setupI18n({
			locale: 'en',
			messages: {
				en: {},
				cs: {},
			},
		});

		const { getByTestId } = render(
			createElement(I18nProvider, { i18n }, createElement(ComponentWithMemoizedI18n, null)),
		);

		expect(getByTestId('locale').textContent).toBe('en');

		act(function activateCs() {
			i18n.activate('cs');
		});

		expect(getByTestId('locale').textContent).toBe('cs');
	});
});
