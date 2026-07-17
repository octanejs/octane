import React from 'react';
import * as THREE from 'three';
import { createRoot, events, extend, flushSync, useFrame } from '@react-three/fiber';
import {
	DisposableObject,
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

extend(THREE);
extend({ DisposableObject });

function FrameSubscriber({ id, record }) {
	useFrame(() => record(id));
	return <group name={`frame-${id}`} />;
}

function BenchScene({
	mode,
	items,
	version,
	geometry,
	material,
	recordFrame,
	recordEvent,
	recordCommit,
}) {
	React.useLayoutEffect(() => {
		recordCommit();
	});
	if (mode === 'mesh') {
		return items.map((item) => <mesh key={item.id} name={item.name} position={[item.x, 0, 0]} />);
	}
	if (mode === 'disposable') {
		return items.map((item) => <disposableObject key={item.id} args={[item.id, version]} />);
	}
	if (mode === 'frames') {
		return items.map((item) => <FrameSubscriber key={item.id} id={item.id} record={recordFrame} />);
	}
	if (mode === 'events') {
		return items.map((item) => (
			<mesh
				key={item.id}
				name={item.name}
				position={[0, 0, item.z]}
				geometry={geometry}
				material={material}
				onPointerMove={() => recordEvent(item.id)}
			/>
		));
	}
	return null;
}

const canvas = document.getElementById('bench');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing benchmark canvas.');
const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshBasicMaterial();
const root = createRoot(canvas);
await root.configure({
	gl: createRenderer(canvas),
	size: { width: 64, height: 64, top: 0, left: 0 },
	dpr: 1,
	frameloop: 'never',
	events,
});
let store;
let identities = new Map();
let frameCalls = 0;
let frameChecksum = 0;
let eventCalls = 0;
let eventChecksum = 0;

function render(mode, items = [], version = 0) {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(
			() => reject(new Error(`R3F did not commit the ${mode} scene within 5 seconds.`)),
			5_000,
		);
		const recordCommit = () => {
			clearTimeout(timeout);
			resolve();
		};
		try {
			flushSync(() => {
				store = root.render(
					<BenchScene
						mode={mode}
						items={items}
						version={version}
						geometry={geometry}
						material={material}
						recordFrame={(id) => {
							frameCalls++;
							frameChecksum += id + 1;
						}}
						recordEvent={(id) => {
							eventCalls++;
							eventChecksum += id + 1;
						}}
						recordCommit={recordCommit}
					/>,
				);
			});
		} catch (error) {
			clearTimeout(timeout);
			reject(error);
		}
	});
}

await render('empty');
const state = store.getState();

async function prepare(op) {
	await render('empty');
	await drainScheduledWork();
	resetDisposals();
	frameCalls = frameChecksum = eventCalls = eventChecksum = 0;
	identities = new Map();
	if (op === 'mount_1k') return;
	if (op === 'reconstruct_dispose_1k') {
		await render('disposable', baseItems, 0);
		identities = captureIdentities(state.scene);
		return;
	}
	if (op === 'frame_1k_subscribers') {
		await render('frames', frameItems);
		frameCalls = frameChecksum = 0;
		return;
	}
	if (op === 'raycast_event') {
		await render('events', eventItems);
		state.scene.updateMatrixWorld(true);
		state.camera.updateMatrixWorld(true);
		eventCalls = eventChecksum = 0;
		return;
	}
	await render('mesh', baseItems);
	identities = captureIdentities(state.scene);
}

async function run(op) {
	if (op === 'mount_1k') await render('mesh', baseItems);
	else if (op === 'update_1k') await render('mesh', updatedItems);
	else if (op === 'reorder_1k') await render('mesh', reorderedItems);
	else if (op === 'unmount_tree_1k') await render('empty');
	else if (op === 'reconstruct_dispose_1k') {
		await render('disposable', baseItems, 1);
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
