import { afterEach, describe, expect, it } from 'vitest';
import { act, flushSync } from '@octanejs/three';
import { createThreeTestRenderer, type ThreeTestRenderer } from '@octanejs/three/testing';
import * as THREE from 'three';
import { DOMRegionScene } from './_fixtures/dom-region.three.tsrx';

interface SceneProps {
	target: HTMLElement | { current: HTMLElement | null };
	theme: string;
	label: string;
	show: boolean;
	reject: boolean;
	order: readonly string[];
	effectToken: 'idle' | 'increment';
	rejectedObject: THREE.Object3D;
	buttonRef?: { current: HTMLButtonElement | null };
	captureEffectToken?: (update: (token: 'idle' | 'increment') => void) => void;
	onLayout?: () => void;
	onCleanup?: () => void;
}

const mountedRoots: ThreeTestRenderer[] = [];
const mountedTargets: HTMLElement[] = [];

function target(): HTMLElement {
	const element = document.createElement('section');
	document.body.append(element);
	mountedTargets.push(element);
	return element;
}

function props(overrides: Partial<SceneProps> = {}): SceneProps {
	return {
		target: target(),
		theme: 'dark',
		label: 'first',
		show: true,
		reject: false,
		order: ['a', 'b', 'region'],
		effectToken: 'idle',
		rejectedObject: new THREE.Object3D(),
		...overrides,
	};
}

async function render(initial: SceneProps): Promise<ThreeTestRenderer> {
	const root = await createThreeTestRenderer(DOMRegionScene, initial);
	mountedRoots.push(root);
	return root;
}

async function update(root: ThreeTestRenderer, next: SceneProps): Promise<void> {
	await act(() => root.update(DOMRegionScene, next));
}

afterEach(() => {
	for (const root of mountedRoots.splice(0)) root.unmount();
	for (const element of mountedTargets.splice(0)) element.remove();
});

describe('DOMRegion', () => {
	it('settles a DOM passive effect that schedules its owning Three root', async () => {
		let setEffectToken!: (token: 'idle' | 'increment') => void;
		const initial = props({
			captureEffectToken(update) {
				setEffectToken = update;
			},
		});
		const root = await render(initial);
		expect(root.scene.getObjectByName('dom-effect-0')).toBeInstanceOf(THREE.Group);

		const acted = act(() => setEffectToken('increment'));

		expect(root.scene.getObjectByName('dom-effect-1')).toBeInstanceOf(THREE.Group);
		await acted;
	});

	it('preserves DOM state and identity while context, content, and the explicit target update', async () => {
		const firstTarget = target();
		const secondTarget = target();
		const targetRef = { current: firstTarget as HTMLElement | null };
		const initial = props({ target: targetRef });
		const root = await render(initial);

		expect(firstTarget.children).toHaveLength(1);
		const ownedContainer = firstTarget.firstElementChild as HTMLDivElement;
		const button = ownedContainer.querySelector('.dom-region-counter') as HTMLButtonElement;
		expect(button.textContent).toBe('dark:first:0');

		flushSync(() => button.click());
		expect(button.textContent).toBe('dark:first:1');

		const reordered = {
			...initial,
			order: ['a', 'region', 'b'],
			theme: 'light',
			label: 'updated',
		};
		await update(root, reordered);
		expect(firstTarget.firstElementChild).toBe(ownedContainer);
		expect(ownedContainer.querySelector('.dom-region-counter')).toBe(button);
		expect(button.textContent).toBe('light:updated:1');

		targetRef.current = secondTarget;
		await update(root, {
			...reordered,
			target: targetRef,
			theme: 'amber',
			label: 'moved',
		});
		expect(firstTarget.children).toHaveLength(0);
		expect(secondTarget.firstElementChild).toBe(ownedContainer);
		expect(ownedContainer.querySelector('.dom-region-counter')).toBe(button);
		expect(button.textContent).toBe('amber:moved:1');
	});

	it('publishes only accepted target/content changes and removes its owned DOM on deletion', async () => {
		const firstTarget = target();
		const secondTarget = target();
		const unrelated = document.createElement('aside');
		secondTarget.append(unrelated);
		const targetRef = { current: firstTarget as HTMLElement | null };
		const buttonRef = { current: null as HTMLButtonElement | null };
		const layouts: Array<HTMLButtonElement | null> = [];
		let cleanups = 0;
		const initial = props({
			target: targetRef,
			buttonRef,
			onLayout: () => layouts.push(buttonRef.current),
			onCleanup: () => cleanups++,
		});
		const root = await render(initial);
		const ownedContainer = firstTarget.firstElementChild as HTMLDivElement;
		const button = ownedContainer.querySelector('.dom-region-counter') as HTMLButtonElement;
		expect(buttonRef.current).toBe(button);
		expect(layouts).toEqual([button]);

		targetRef.current = secondTarget;
		expect(() =>
			root.update(DOMRegionScene, {
				...initial,
				target: targetRef,
				label: 'rejected',
				reject: true,
			}),
		).toThrow(/Cannot attach/);
		expect(firstTarget.firstElementChild).toBe(ownedContainer);
		expect([...secondTarget.children]).toEqual([unrelated]);
		expect(button.textContent).toBe('dark:first:0');

		await update(root, {
			...initial,
			target: targetRef,
			label: 'accepted',
		});
		expect([...secondTarget.children]).toEqual([unrelated, ownedContainer]);
		expect(button.textContent).toBe('dark:accepted:0');

		await update(root, { ...initial, target: targetRef, show: false });
		expect([...secondTarget.children]).toEqual([unrelated]);
		expect(button.isConnected).toBe(false);
		expect(buttonRef.current).toBeNull();
		expect(cleanups).toBe(1);

		await update(root, { ...initial, target: targetRef, show: true });
		const remounted = secondTarget.querySelector('.dom-region-counter') as HTMLButtonElement;
		expect(remounted).not.toBe(button);
		expect(remounted.textContent).toBe('dark:first:0');
		expect(buttonRef.current).toBe(remounted);
		expect(layouts).toEqual([button, remounted]);

		root.unmount();
		expect([...secondTarget.children]).toEqual([unrelated]);
		expect(remounted.isConnected).toBe(false);
		expect(buttonRef.current).toBeNull();
		expect(cleanups).toBe(2);
	});
});
