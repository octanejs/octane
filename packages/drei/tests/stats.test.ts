import * as React from 'react';
import {
	act as reactThreeAct,
	advance as reactAdvance,
	createRoot as createReactThreeRoot,
	useThree as reactUseThree,
	type RootState as ReactRootState,
} from '@react-three/fiber';
import { Stats as ReactStats } from '@react-three/drei/core/Stats.js';
import { StatsGl as ReactStatsGl } from '@react-three/drei/core/StatsGl.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { StatsGlScene, StatsScene } from './_fixtures/stats.three.tsrx';

const mocks = vi.hoisted(() => {
	const statsInstances: any[] = [];
	const statsGlInstances: any[] = [];
	class Stats {
		dom = document.createElement('div');
		showPanel = vi.fn();
		begin = vi.fn();
		end = vi.fn();
		constructor() {
			statsInstances.push(this);
		}
	}
	class StatsGl {
		domElement = document.createElement('div');
		init = vi.fn();
		update = vi.fn();
		constructor(readonly options: Record<string, unknown>) {
			const canvas = document.createElement('canvas');
			canvas.style.position = 'absolute';
			this.domElement.style.position = 'fixed';
			this.domElement.appendChild(canvas);
			statsGlInstances.push(this);
		}
	}
	return { Stats, StatsGl, statsInstances, statsGlInstances };
});

vi.mock('stats.js', () => ({ default: mocks.Stats }));
vi.mock('stats-gl', () => ({ default: mocks.StatsGl }));

beforeEach(() => {
	mocks.statsInstances.length = 0;
	mocks.statsGlInstances.length = 0;
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

function renderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
	return {
		domElement: canvas,
		outputColorSpace: THREE.SRGBColorSpace,
		toneMapping: THREE.NoToneMapping,
		render() {},
		setPixelRatio() {},
		setSize() {},
		renderLists: { dispose() {} },
		forceContextLoss() {},
		dispose() {},
	} as unknown as THREE.WebGLRenderer;
}

describe('Stats', () => {
	it('matches panel selection, parent/classes, global frame callbacks, and cleanup', async () => {
		const reactParent = document.createElement('section');
		let reactState!: ReactRootState;
		function ReactScene() {
			reactState = reactUseThree();
			return React.createElement(ReactStats, {
				showPanel: 2,
				className: 'alpha beta',
				parent: { current: reactParent },
			});
		}
		const canvas = document.createElement('canvas');
		const reactRoot = createReactThreeRoot(canvas);
		await reactRoot.configure({ gl: renderer(canvas), frameloop: 'never', dpr: 1 });
		await reactThreeAct(async () => reactRoot.render(React.createElement(ReactScene)));
		const reactStats = mocks.statsInstances.at(-1)!;
		reactAdvance(1, true, reactState);
		const reactSnapshot = {
			panel: reactStats.showPanel.mock.calls,
			classes: [...reactStats.dom.classList],
			attached: reactStats.dom.parentNode === reactParent,
			begin: reactStats.begin.mock.calls.length,
			end: reactStats.end.mock.calls.length,
		};
		await reactThreeAct(async () => reactRoot.unmount());

		const octaneParent = document.createElement('section');
		const octaneRoot = await createOctaneThree(StatsScene, {
			showPanel: 2,
			className: 'alpha beta',
			parent: { current: octaneParent },
		});
		await reactThreeAct(async () => {
			for (let index = 0; index < 8; index++) await Promise.resolve();
		});
		const octaneStats = mocks.statsInstances.at(-1)!;
		octaneRoot.advanceFrames(1);
		expect({
			panel: octaneStats.showPanel.mock.calls,
			classes: [...octaneStats.dom.classList],
			attached: octaneStats.dom.parentNode === octaneParent,
			begin: octaneStats.begin.mock.calls.length,
			end: octaneStats.end.mock.calls.length,
		}).toEqual(reactSnapshot);
		octaneRoot.unmount();
		await reactThreeAct(async () => {
			for (let index = 0; index < 8; index++) await Promise.resolve();
		});
		expect(octaneStats.dom.parentNode).toBeNull();
		expect(reactStats.dom.parentNode).toBeNull();
		expect([...octaneStats.dom.classList]).toEqual([]);
	});
});

describe('StatsGl', () => {
	it('matches initialization, options, DOM normalization, ref, update, and cleanup', async () => {
		const reactParent = document.createElement('section');
		let reactState!: ReactRootState;
		let reactElement: HTMLDivElement | null = null;
		function ReactScene() {
			reactState = reactUseThree();
			return React.createElement(ReactStatsGl, {
				ref: (value) => (reactElement = value),
				parent: { current: reactParent },
				id: 'perf',
				className: 'one two',
				clearStatsGlStyle: true,
				showPanel: 1,
				logsPerSecond: 8,
			});
		}
		const canvas = document.createElement('canvas');
		const reactRoot = createReactThreeRoot(canvas);
		const reactRenderer = renderer(canvas);
		await reactRoot.configure({ gl: reactRenderer, frameloop: 'never', dpr: 1 });
		await reactThreeAct(async () => reactRoot.render(React.createElement(ReactScene)));
		const reactStats = mocks.statsGlInstances.at(-1)!;
		reactAdvance(1, true, reactState);

		const octaneParent = document.createElement('section');
		let octaneElement: HTMLDivElement | null = null;
		const octaneRoot = await createOctaneThree(StatsGlScene, {
			ref: (value: HTMLDivElement | null) => (octaneElement = value),
			parent: { current: octaneParent },
			id: 'perf',
			className: 'one two',
			clearStatsGlStyle: true,
			showPanel: 1,
			logsPerSecond: 8,
		});
		const octaneStats = mocks.statsGlInstances.at(-1)!;
		octaneRoot.advanceFrames(1);

		expect(octaneStats.options).toEqual(reactStats.options);
		expect(octaneStats.init).toHaveBeenCalledOnce();
		expect(reactStats.init).toHaveBeenCalledWith(reactRenderer);
		expect(octaneElement).toBe(octaneStats.domElement);
		expect(reactElement).toBe(reactStats.domElement);
		expect(octaneStats.domElement.id).toBe(reactStats.domElement.id);
		expect([...octaneStats.domElement.classList]).toEqual([...reactStats.domElement.classList]);
		expect(octaneStats.domElement.hasAttribute('style')).toBe(false);
		expect(octaneStats.domElement.querySelector('canvas')!.style.position).toBe('');
		expect(octaneStats.update.mock.calls.length).toBe(reactStats.update.mock.calls.length);

		octaneRoot.unmount();
		await reactThreeAct(async () => reactRoot.unmount());
		expect(octaneElement).toBeNull();
		expect(reactElement).toBeNull();
		expect(octaneStats.domElement.parentNode).toBeNull();
	});
});
