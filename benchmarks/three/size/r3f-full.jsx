import React from 'react';
import * as THREE from 'three';
import { createRoot, extend, flushSync } from '@react-three/fiber';
import { createSizeRenderer, publishSizeChecksum, waitForR3FScene } from './renderer.js';

extend(THREE);

const canvas = document.querySelector('canvas');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing size benchmark canvas.');

const root = createRoot(canvas);
await root.configure({
	gl: createSizeRenderer(canvas),
	size: { width: 1, height: 1, top: 0, left: 0 },
	dpr: 1,
	frameloop: 'never',
});
let store;
flushSync(() => {
	store = root.render(<mesh name="size-mesh" />);
});
const scene = store.getState().scene;
await waitForR3FScene(scene);
publishSizeChecksum(scene, Object.keys(THREE).length);
