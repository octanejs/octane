import * as React from 'react';
import {
	act as reactThreeAct,
	advance as reactAdvance,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
	useThree as reactUseThree,
	type RootState as ReactRootState,
} from '@react-three/fiber';
import {
	Helper as ReactHelper,
	useHelper as reactUseHelper,
} from '@react-three/drei/core/Helper.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { HelperScene, UseHelperScene } from './_fixtures/helper.three.tsrx';

beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	extendReactThree(THREE as unknown as Record<string, new (...args: any[]) => any>);
});

class ProbeHelper extends THREE.Object3D {
	static instances: ProbeHelper[] = [];
	updates = 0;
	disposed = false;
	constructor(
		readonly target: THREE.Object3D,
		readonly label: string,
		readonly size: number,
	) {
		super();
		this.name = label;
		this.add(new THREE.Object3D());
		ProbeHelper.instances.push(this);
	}
	update() {
		this.updates++;
	}
	dispose() {
		this.disposed = true;
	}
}

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

async function reactRoot(Component: React.ComponentType) {
	const canvas = document.createElement('canvas');
	const root = createReactThreeRoot(canvas);
	let get!: () => ReactRootState;
	function Capture() {
		get = reactUseThree((state) => state.get);
		return React.createElement(Component);
	}
	await root.configure({ gl: renderer(canvas), frameloop: 'never' });
	await reactThreeAct(async () => root.render(React.createElement(Capture)));
	return { root, getState: () => get() };
}

describe('helper utilities', () => {
	it('matches useHelper construction, scene attachment, frame updates, raycast suppression, and cleanup', async () => {
		ProbeHelper.instances = [];
		let reactRef!: React.RefObject<ProbeHelper | null>;
		function ReactScene() {
			const target = React.useRef<THREE.Mesh>(null);
			reactRef = reactUseHelper(target, ProbeHelper, 'probe', 3);
			return React.createElement(
				'mesh',
				{ ref: target, name: 'target' },
				React.createElement('boxGeometry'),
				React.createElement('meshBasicMaterial'),
			);
		}
		const react = await reactRoot(ReactScene);
		let octaneRef!: { current: ProbeHelper | null };
		const octane = await createOctaneThree(UseHelperScene, {
			type: ProbeHelper,
			args: ['probe', 3],
			onHelper: (ref: typeof octaneRef) => (octaneRef = ref),
		});
		const snapshot = (helper: ProbeHelper) => ({
			name: helper.name,
			label: helper.label,
			size: helper.size,
			targetName: helper.target.name,
			inScene: helper.parent?.type,
			raycasts: [helper, ...helper.children].map((child) => child.raycast([], {} as any)),
		});
		expect(snapshot(octaneRef.current!)).toEqual(snapshot(reactRef.current!));
		reactAdvance(1, true, react.getState());
		octane.advanceFrames(1, 1);
		expect(octaneRef.current!.updates).toBe(reactRef.current!.updates);
		const reactHelper = reactRef.current!;
		const octaneHelper = octaneRef.current!;
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
		expect({
			current: octaneRef.current,
			disposed: octaneHelper.disposed,
			parent: octaneHelper.parent,
		}).toEqual({
			current: reactRef.current,
			disposed: reactHelper.disposed,
			parent: reactHelper.parent,
		});
	});

	it('matches Helper parent targeting and constructor arguments', async () => {
		ProbeHelper.instances = [];
		const react = await reactRoot(() =>
			React.createElement(
				'mesh',
				{ name: 'target' },
				React.createElement('boxGeometry'),
				React.createElement('meshBasicMaterial'),
				React.createElement(ReactHelper, { type: ProbeHelper, args: ['component', 7] }),
			),
		);
		const reactHelper = ProbeHelper.instances.at(-1)!;
		const octane = await createOctaneThree(HelperScene, {
			type: ProbeHelper,
			args: ['component', 7],
		});
		const octaneHelper = ProbeHelper.instances.at(-1)!;
		expect({
			target: octaneHelper.target.name,
			label: octaneHelper.label,
			size: octaneHelper.size,
		}).toEqual({
			target: reactHelper.target.name,
			label: reactHelper.label,
			size: reactHelper.size,
		});
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});
});
