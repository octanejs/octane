import { describe, expect, it } from 'vitest';
import { animate, type JSAnimation, type Scope } from 'animejs';
import type { UseAnimeScopeResult } from '@octanejs/animejs';
import { flushEffects, mount } from '../../octane/tests/_helpers';
import { ScopeProbe } from './_fixtures/scope.tsrx';

describe('useAnimeScope', () => {
	it('creates a rooted scope after mount and reverts it on unmount', () => {
		const scopes: Scope[] = [];
		const cleanups: Scope[] = [];
		let result: UseAnimeScopeResult | undefined;
		const capture = (next: UseAnimeScopeResult) => {
			result = next;
		};
		const onSetup = (scope: Scope) => {
			scopes.push(scope);
			return () => cleanups.push(scope);
		};

		const mounted = mount(ScopeProbe, { dependency: 'first', capture, onSetup });
		const stableResult = result;

		expect(result?.root.current).toBe(mounted.container.firstElementChild);
		expect(result?.scope.current).toBeNull();
		flushEffects();
		expect(scopes).toHaveLength(1);
		expect(result?.scope.current).toBe(scopes[0]);
		expect(scopes[0].root).toBe(result?.root.current);

		mounted.update(ScopeProbe, { dependency: 'first', capture, onSetup });
		flushEffects();
		expect(result).toBe(stableResult);
		expect(scopes).toHaveLength(1);
		expect(cleanups).toHaveLength(0);

		mounted.unmount();
		flushEffects();
		expect(cleanups).toEqual([scopes[0]]);
		expect(result?.scope.current).toBeNull();
	});

	it('reverts the previous scope before recreating it when dependencies change', () => {
		const events: string[] = [];
		const scopes: Scope[] = [];
		let result: UseAnimeScopeResult | undefined;
		const capture = (next: UseAnimeScopeResult) => {
			result = next;
		};
		const onSetup = (scope: Scope) => {
			const index = scopes.push(scope);
			events.push(`setup:${index}`);
			return () => events.push(`cleanup:${index}`);
		};

		const mounted = mount(ScopeProbe, { dependency: 'first', capture, onSetup });
		flushEffects();
		mounted.update(ScopeProbe, { dependency: 'second', capture, onSetup });
		flushEffects();

		expect(events).toEqual(['setup:1', 'cleanup:1', 'setup:2']);
		expect(result?.scope.current).toBe(scopes[1]);
		mounted.unmount();
		flushEffects();
		expect(events).toEqual(['setup:1', 'cleanup:1', 'setup:2', 'cleanup:2']);
	});

	it('isolates selectors to each root and exposes registered scope methods', () => {
		let first: UseAnimeScopeResult | undefined;
		let second: UseAnimeScopeResult | undefined;
		let firstAnimation: JSAnimation | undefined;
		let secondAnimation: JSAnimation | undefined;
		let completions = 0;
		const firstRoot = mount(ScopeProbe, {
			dependency: 'first',
			capture: (result) => {
				first = result;
			},
			onSetup(scope) {
				scope.add('move', () => {
					firstAnimation = animate('.target', {
						x: 100,
						duration: 100,
						ease: 'linear',
						autoplay: false,
						onComplete: () => completions++,
					});
					firstAnimation.seek(100);
				});
			},
		});
		const secondRoot = mount(ScopeProbe, {
			dependency: 'second',
			capture: (result) => {
				second = result;
			},
			onSetup() {
				secondAnimation = animate('.target', {
					x: 50,
					duration: 100,
					ease: 'linear',
					autoplay: false,
				});
			},
		});
		flushEffects();

		first?.scope.current?.methods.move();
		const firstTarget = firstRoot.container.querySelector<HTMLElement>('.target')!;
		const secondTarget = secondRoot.container.querySelector<HTMLElement>('.target')!;
		expect(firstTarget.style.transform).toContain('100px');
		expect(secondTarget.style.transform).not.toContain('100px');
		expect(completions).toBe(1);

		secondAnimation!.seek(100);
		expect(secondTarget.style.transform).toContain('50px');
		first?.scope.current?.refresh();
		expect(firstAnimation).toBeDefined();

		firstRoot.unmount();
		secondRoot.unmount();
		flushEffects();
		expect(firstTarget.style.transform).toBe('');
		expect(secondTarget.style.transform).toBe('');
	});

	it('restores Anime.js global scope state when setup throws', () => {
		const failure = new Error('setup failed');
		const mounted = mount(ScopeProbe, {
			dependency: 'error',
			capture: () => {},
			onSetup() {
				throw failure;
			},
		});

		flushEffects();

		const external = document.createElement('div');
		external.className = 'after-failure';
		document.body.append(external);
		const animation = animate('.after-failure', {
			x: 25,
			duration: 100,
			ease: 'linear',
			autoplay: false,
		});
		animation.seek(100);
		expect(external.style.transform).toContain('25px');

		animation.revert();
		external.remove();
		mounted.unmount();
		flushEffects();
	});
});
