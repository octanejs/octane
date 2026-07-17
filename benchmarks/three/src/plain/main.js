import * as THREE from 'three';
import {
	DisposableObject,
	EVENT_COUNT,
	EVENT_REPS,
	FRAME_COUNT,
	FRAME_REPS,
	MESH_COUNT,
	baseItems,
	captureIdentities,
	disposalCount,
	eventItems,
	resetDisposals,
	snapshotScene,
	updatedItems,
	reorderedItems,
} from '../shared.js';

const canvas = document.getElementById('bench');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing benchmark canvas.');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
camera.position.z = 5;
camera.lookAt(0, 0, 0);
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshBasicMaterial();
let identities = new Map();
let frameCallbacks = [];
let frameCalls = 0;
let frameChecksum = 0;
let eventCalls = 0;
let eventChecksum = 0;

function clear(dispose = false) {
	for (const child of [...scene.children]) {
		scene.remove(child);
		if (dispose) child.dispose?.();
	}
	frameCallbacks = [];
}

function mountMeshes(items) {
	clear();
	for (const item of items) {
		const mesh = new THREE.Mesh();
		mesh.name = item.name;
		mesh.position.set(item.x, 0, 0);
		scene.add(mesh);
	}
}

function mountDisposable(version) {
	clear(true);
	for (const item of baseItems) scene.add(new DisposableObject(item.id, version));
}

function mountFrames() {
	clear();
	for (let id = 0; id < FRAME_COUNT; id++) {
		const group = new THREE.Group();
		group.name = `frame-${id}`;
		scene.add(group);
		frameCallbacks.push(() => {
			frameCalls++;
			frameChecksum += id + 1;
		});
	}
}

function mountEvents() {
	clear();
	for (const item of eventItems) {
		const mesh = new THREE.Mesh(geometry, material);
		mesh.name = item.name;
		mesh.position.z = item.z;
		mesh.userData.eventId = item.id;
		scene.add(mesh);
	}
	scene.updateMatrixWorld(true);
	camera.updateMatrixWorld(true);
}

canvas.addEventListener('pointermove', (event) => {
	const bounds = canvas.getBoundingClientRect();
	pointer.set(
		((event.clientX - bounds.left) / bounds.width) * 2 - 1,
		-((event.clientY - bounds.top) / bounds.height) * 2 + 1,
	);
	raycaster.setFromCamera(pointer, camera);
	const delivered = new Set();
	for (const hit of raycaster.intersectObjects(scene.children, false)) {
		if (delivered.has(hit.object)) continue;
		delivered.add(hit.object);
		const id = hit.object.userData.eventId;
		if (typeof id === 'number') {
			eventCalls++;
			eventChecksum += id + 1;
		}
	}
});

async function prepare(op) {
	clear(true);
	resetDisposals();
	frameCalls = frameChecksum = eventCalls = eventChecksum = 0;
	identities = new Map();
	if (op === 'mount_1k') return;
	if (op === 'reconstruct_dispose_1k') {
		mountDisposable(0);
		resetDisposals();
		identities = captureIdentities(scene);
		return;
	}
	if (op === 'frame_1k_subscribers') {
		mountFrames();
		frameCalls = frameChecksum = 0;
		return;
	}
	if (op === 'raycast_event') {
		mountEvents();
		eventCalls = eventChecksum = 0;
		return;
	}
	mountMeshes(baseItems);
	identities = captureIdentities(scene);
}

async function run(op) {
	if (op === 'mount_1k') mountMeshes(baseItems);
	else if (op === 'update_1k') {
		for (let index = 0; index < scene.children.length; index++) {
			scene.children[index].position.x = updatedItems[index].x;
		}
	} else if (op === 'reorder_1k') {
		const byName = new Map(scene.children.map((child) => [child.name, child]));
		for (const item of reorderedItems) {
			const child = byName.get(item.name);
			child.position.x = item.x;
			scene.add(child);
		}
	} else if (op === 'unmount_tree_1k') clear();
	else if (op === 'reconstruct_dispose_1k') mountDisposable(1);
	else if (op === 'frame_1k_subscribers') {
		for (let index = 0; index < FRAME_REPS; index++) {
			for (const callback of frameCallbacks) callback();
		}
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
		return snapshotScene(scene, identities, {
			frameCalls,
			frameChecksum,
			eventCalls,
			eventChecksum,
			disposalCount: disposalCount(),
			constants: { EVENT_COUNT, EVENT_REPS, FRAME_COUNT, FRAME_REPS },
		});
	},
};
