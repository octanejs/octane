import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { act, createRoot, flushSync, unmountComponentAtNode, type Renderer } from '@octanejs/three';
import { SchedulingScene } from './_fixtures/scheduling.three.tsrx';

function createRenderer(canvas: HTMLCanvasElement): Renderer {
	return {
		domElement: canvas,
		render() {},
		setPixelRatio() {},
		setSize() {},
		dispose() {},
		forceContextLoss() {},
		renderLists: { dispose() {} },
		shadowMap: { enabled: false, type: THREE.PCFShadowMap },
	};
}

describe('@octanejs/three public root API', () => {
	it('coordinates direct rendering through the public scheduling and unmount helpers', async () => {
		const canvas = document.createElement('canvas');
		const root = createRoot(canvas);
		await root.configure({
			gl: createRenderer(canvas),
			frameloop: 'never',
			size: { width: 80, height: 40 },
		});
		let group: THREE.Group | null = null;
		let setName!: (name: string) => void;
		const effects: string[] = [];
		const groupRef = (value: THREE.Group | null) => {
			group = value;
		};

		try {
			root.render(SchedulingScene, {
				name: 'initial-root',
				groupRef,
				onReady(updateName) {
					setName = updateName;
				},
				onEffect(name) {
					effects.push(name);
				},
			});
			const retained = group as THREE.Group | null;
			expect(retained).toBeInstanceOf(THREE.Group);
			expect(retained?.name).toBe('initial-root');

			const result = flushSync(() => {
				setName('sync-root');
				return 'flushed';
			});
			expect(result).toBe('flushed');
			expect(retained?.name).toBe('sync-root');

			const acted = act(() => setName('acted-root'));
			// Octane's sync-act contract publishes updates before the thenable is awaited.
			expect(group).toBe(retained);
			expect((group as THREE.Group | null)?.name).toBe('acted-root');
			expect(effects.at(-1)).toBe('acted-root');
			await acted;

			const afterUnmount = vi.fn();
			unmountComponentAtNode(canvas, afterUnmount);
			expect(afterUnmount).toHaveBeenCalledOnce();
			expect(afterUnmount).toHaveBeenCalledWith(canvas);
			expect(group).toBeNull();
		} finally {
			root.unmount();
		}
	});
});
