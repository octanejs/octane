import * as THREE from 'three';
import { createRoot, extend, flushSync } from '@octanejs/three';
import { createSizeRenderer, publishSizeChecksum } from './renderer.js';

extend(THREE);

function SizeScene() @{
	<mesh name="size-mesh" />
}

const canvas = document.querySelector('canvas');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing size benchmark canvas.');

const root = createRoot(canvas);
await root.configure({
	gl: createSizeRenderer(canvas),
	size: { width: 1, height: 1 },
	dpr: 1,
	frameloop: 'never',
});
flushSync(() => root.render(SizeScene));
publishSizeChecksum(root.store.getState().scene, Object.keys(THREE).length);
