import * as React from 'react';
import {
	act as reactThreeAct,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
	useThree as reactUseThree,
	type RootState,
} from '@react-three/fiber';
import {
	Example as ReactExample,
	type ExampleApi as ReactExampleApi,
} from '@react-three/drei/core/Example.js';
import { useFont as reactUseFont } from '@react-three/drei/core/useFont.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { type ExampleApi, useFont, type FontData } from '../src/index.js';
import { ExampleScene } from './_fixtures/example.three.tsrx';

const font: FontData = {
	boundingBox: { yMax: 1189, yMin: -334 },
	familyName: 'Parity Sans',
	resolution: 1000,
	underlineThickness: 50,
	glyphs: {
		'0': {
			_cachedOutline: [],
			ha: 792,
			o: 'm 394 -29 q 153 129 242 -29 q 73 479 73 272 q 152 829 73 687 q 394 989 241 989 q 634 829 545 989 q 715 479 715 684 q 635 129 715 270 q 394 -29 546 -29 m 394 89 q 546 211 489 89 q 598 479 598 322 q 548 748 598 640 q 394 871 491 871 q 241 748 298 871 q 190 479 190 637 q 239 211 190 319 q 394 89 296 89',
		},
		'1': {
			_cachedOutline: [],
			ha: 792,
			o: 'm 574 0 l 442 0 l 442 697 l 215 697 l 215 796 q 386 833 330 796 q 475 986 447 875 l 574 986 l 574 0',
		},
		'2': {
			_cachedOutline: [],
			ha: 792,
			o: 'm 731 0 l 59 0 q 197 314 59 188 q 457 487 199 315 q 598 691 598 580 q 543 819 598 772 q 411 867 488 867 q 272 811 328 867 q 209 630 209 747 l 81 630 q 182 901 81 805 q 408 986 271 986 q 629 909 536 986 q 731 694 731 826 q 613 449 731 541 q 378 316 495 383 q 201 122 235 234 l 731 122 l 731 0',
		},
		'3': {
			_cachedOutline: [],
			ha: 792,
			o: 'm 737 284 q 635 55 737 141 q 399 -25 541 -25 q 156 52 248 -25 q 54 308 54 140 l 185 308 q 245 147 185 202 q 395 96 302 96 q 539 140 484 96 q 602 280 602 190 q 510 429 602 390 q 324 454 451 454 l 324 565 q 487 584 441 565 q 565 719 565 617 q 515 835 565 791 q 395 879 466 879 q 255 824 307 879 q 203 661 203 769 l 78 661 q 166 909 78 822 q 387 992 250 992 q 603 921 513 992 q 701 723 701 844 q 669 607 701 656 q 578 524 637 558 q 696 434 655 499 q 737 284 737 369',
		},
		'9': {
			_cachedOutline: [],
			ha: 792,
			o: 'm 739 524 q 619 94 739 241 q 362 -32 516 -32 q 150 47 242 -32 q 59 244 59 126 l 191 244 q 246 129 191 176 q 373 82 301 82 q 526 161 466 82 q 597 440 597 255 q 363 334 501 334 q 130 432 216 334 q 53 650 53 521 q 134 880 53 786 q 383 986 226 986 q 659 841 566 986 q 739 524 739 719 m 388 449 q 535 514 480 449 q 585 658 585 573 q 535 805 585 744 q 388 873 480 873 q 242 809 294 873 q 191 658 191 745 q 239 514 191 572 q 388 449 292 449',
		},
		'-': { _cachedOutline: [], ha: 478, o: 'm 350 317 l 8 317 l 8 428 l 350 428 l 350 317' },
		'?': { _cachedOutline: [], ha: 500, o: 'm 0 0 l 500 0 l 500 700 l 0 700 l 0 0' },
	},
};

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

async function flush() {
	await reactThreeAct(async () => {
		for (let index = 0; index < 8; index++) await Promise.resolve();
	});
}

function findText(root: THREE.Object3D): THREE.Mesh {
	let result!: THREE.Mesh;
	root.traverse((object) => {
		if ((object as THREE.Mesh).geometry?.type === 'TextGeometry') result = object as THREE.Mesh;
	});
	return result;
}

function snapshot(group: THREE.Group) {
	const text = findText(group);
	return {
		name: group.name,
		position: group.position.toArray(),
		positionCount: text.geometry.getAttribute('position').count,
		material: (text.material as THREE.Material).type,
		userChild: Boolean(group.getObjectByName('user-child')),
	};
}

describe('Example', () => {
	it('matches the pinned React counter API, text output, material mode, group props, and user children', async () => {
		extendReactThree(THREE as unknown as Record<string, new (...args: any[]) => any>);
		let reactApi!: ReactExampleApi;
		const canvas = document.createElement('canvas');
		const reactRoot = createReactThreeRoot(canvas);
		let reactState!: RootState;
		function Capture() {
			reactState = reactUseThree();
			return null;
		}
		await reactRoot.configure({ gl: renderer(canvas), frameloop: 'never' });
		await reactThreeAct(async () =>
			reactRoot.render(
				React.createElement(
					React.Fragment,
					null,
					React.createElement(
						ReactExample,
						{
							ref: (value: ReactExampleApi) => (reactApi = value),
							font: font as any,
							color: '#123456',
							name: 'example',
							position: [1, 2, 3],
						},
						React.createElement('group', { name: 'user-child' }),
					),
					React.createElement(Capture),
				),
			),
		);
		let octaneApi!: ExampleApi;
		const octaneRoot = await createOctaneThree(ExampleScene, {
			apiRef: (value: ExampleApi) => (octaneApi = value),
			font: font as any,
			color: '#123456',
			debug: false,
			bevelSize: 0.04,
		});
		await flush();
		const reactGroup = reactState.scene.getObjectByName('example') as THREE.Group;
		const octaneGroup = octaneRoot.scene.getObjectByName('example') as THREE.Group;
		expect(snapshot(octaneGroup)).toEqual(snapshot(reactGroup));
		const reactInitialGeometry = findText(reactGroup).geometry.uuid;
		const octaneInitialGeometry = findText(octaneGroup).geometry.uuid;
		await reactThreeAct(async () => reactApi.incr(3));
		octaneApi.incr(3);
		await flush();
		expect(findText(reactGroup).geometry.uuid).not.toBe(reactInitialGeometry);
		expect(findText(octaneGroup).geometry.uuid).not.toBe(octaneInitialGeometry);
		expect(snapshot(octaneGroup).positionCount).toBe(snapshot(reactGroup).positionCount);
		await reactThreeAct(async () => reactApi.decr());
		octaneApi.decr();
		await flush();
		expect(snapshot(octaneGroup).positionCount).toBe(snapshot(reactGroup).positionCount);
		octaneGroup.position.x += 1;
		expect(snapshot(octaneGroup)).not.toEqual(snapshot(reactGroup));
		octaneRoot.unmount();
		await reactThreeAct(async () => reactRoot.unmount());
		useFont.clear(font);
		reactUseFont.clear(font);
	});
});
