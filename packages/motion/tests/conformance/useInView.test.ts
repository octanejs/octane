import { describe, expect, it, vi } from 'vitest';
import { InViewPair } from '../_fixtures/inview.tsrx';
import { flushEffects, mount } from '../_helpers';

describe('useInView', () => {
	it('tracks separate element refs, changing observer options and one-time entry', () => {
		const observers: Observer[] = [];
		class Observer {
			readonly targets = new Set<Element>();

			constructor(
				readonly callback: IntersectionObserverCallback,
				readonly options: IntersectionObserverInit,
			) {
				observers.push(this);
			}

			observe(element: Element) {
				this.targets.add(element);
			}

			unobserve(element: Element) {
				this.targets.delete(element);
			}

			disconnect() {
				this.targets.clear();
			}
		}

		vi.stubGlobal('IntersectionObserver', Observer);
		try {
			const options = { initial: true, amount: 0.5, margin: '0px 20%' } as const;
			const r = mount(InViewPair, { options });
			try {
				const left = r.find('#left');
				const right = r.find('#right');
				const view = () => [left.getAttribute('data-visible'), right.getAttribute('data-visible')];
				const observerOf = (target: Element) =>
					observers.find((observer) => observer.targets.has(target));
				const intersect = (target: Element, isIntersecting: boolean) => {
					const observer = observerOf(target);
					observer?.callback(
						[{ target, isIntersecting } as IntersectionObserverEntry],
						observer as unknown as IntersectionObserver,
					);
					flushEffects();
				};

				expect(view()).toEqual(['false', 'true']);
				flushEffects();
				expect(observerOf(right)?.options).toMatchObject({ threshold: 0.5, rootMargin: '0px 20%' });
				intersect(right, true);
				intersect(left, true);
				expect(view()).toEqual(['true', 'true']);
				intersect(right, false);
				expect(view()).toEqual(['true', 'false']);

				const root = document.createElement('main');
				r.update(InViewPair, { options: { root: { current: root }, once: true, amount: 'all' } });
				flushEffects();
				expect(observerOf(right)?.options).toMatchObject({ root, threshold: 1 });
				intersect(right, true);
				expect(view()).toEqual(['true', 'true']);
				expect(observerOf(right)).toBeUndefined();
				intersect(left, false);
				expect(view()).toEqual(['false', 'true']);
			} finally {
				r.unmount();
			}
			expect(observers.every((observer) => observer.targets.size === 0)).toBe(true);
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
