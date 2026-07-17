import { BoxGeometry, MeshBasicMaterial } from 'three';
import { createRoot, events, flushSync } from '@octanejs/three';
import { BenchScene } from './Scene.three.tsrx';
import {
	EVENT_COUNT,
	EVENT_REPS,
	FRAME_COUNT,
	FRAME_REPS,
	MESH_COUNT,
	baseItems,
	captureIdentities,
	createRenderer,
	disposalCount,
	drainScheduledWork,
	eventItems,
	frameItems,
	reorderedItems,
	resetDisposals,
	snapshotScene,
	updatedItems,
	waitForDisposals,
} from '../shared.js';

const canvas = document.getElementById('bench');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing benchmark canvas.');
const geometry = new BoxGeometry(1, 1, 1);
const material = new MeshBasicMaterial();
const root = createRoot(canvas);
await root.configure({
	gl: createRenderer(canvas),
	size: { width: 64, height: 64 },
	dpr: 1,
	frameloop: 'never',
	events,
});
const state = root.store.getState();
let identities = new Map();
let frameCalls = 0;
let frameChecksum = 0;
let eventCalls = 0;
let eventChecksum = 0;

function render(mode, items = [], version = 0) {
	flushSync(() => {
		root.render(BenchScene, {
			mode,
			items,
			version,
			geometry,
			material,
			recordFrame(id) {
				frameCalls++;
				frameChecksum += id + 1;
			},
			recordEvent(id) {
				eventCalls++;
				eventChecksum += id + 1;
			},
		});
	});
}

async function prepare(op) {
	render('empty');
	await drainScheduledWork();
	resetDisposals();
	frameCalls = frameChecksum = eventCalls = eventChecksum = 0;
	identities = new Map();
	if (op === 'mount_1k') return;
	if (op === 'reconstruct_dispose_1k') {
		render('disposable', baseItems, 0);
		identities = captureIdentities(state.scene);
		return;
	}
	if (op === 'frame_1k_subscribers') {
		render('frames', frameItems);
		frameCalls = frameChecksum = 0;
		return;
	}
	if (op === 'raycast_event') {
		render('events', eventItems);
		state.scene.updateMatrixWorld(true);
		state.camera.updateMatrixWorld(true);
		eventCalls = eventChecksum = 0;
		return;
	}
	render('mesh', baseItems);
	identities = captureIdentities(state.scene);
}

async function run(op) {
	if (op === 'mount_1k') render('mesh', baseItems);
	else if (op === 'update_1k') render('mesh', updatedItems);
	else if (op === 'reorder_1k') render('mesh', reorderedItems);
	else if (op === 'unmount_tree_1k') render('empty');
	else if (op === 'reconstruct_dispose_1k') {
		render('disposable', baseItems, 1);
		await waitForDisposals(MESH_COUNT);
	} else if (op === 'frame_1k_subscribers') {
		for (let index = 0; index < FRAME_REPS; index++) state.advance(index / 60);
	} else if (op === 'raycast_event') {
		const bounds = canvas.getBoundingClientRect();
		for (let index = 0; index < EVENT_REPS; index++) {
			canvas.dispatchEvent(
				new PointerEvent('pointermove', {
					bubbles: true,
					clientX: bounds.left + bounds.width / 2,
					clientY: bounds.top + bounds.height / 2,
					pointerId: index + 1,
				}),
			);
		}
	}
}

globalThis.__threeBench = {
	ready: true,
	prepare,
	run,
	snapshot() {
		return snapshotScene(state.scene, identities, {
			frameCalls,
			frameChecksum,
			eventCalls,
			eventChecksum,
			disposalCount: disposalCount(),
			constants: { EVENT_COUNT, EVENT_REPS, FRAME_COUNT, FRAME_REPS },
		});
	},
};
