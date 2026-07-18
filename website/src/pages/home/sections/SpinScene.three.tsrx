// The 3D flame: the logo's two flame outlines (./flame.ts) extruded into real
// geometry. Drag anywhere on the canvas to throw it around (with inertia); left
// alone it settles back into a slow idle spin. The scene is deliberately
// battery-polite — the frame loop drops to 'demand' while the canvas is off
// screen, and prefers-reduced-motion disables the idle spin entirely (dragging
// still works; each pointer delta invalidates one frame).
//
// This is a `.three.tsrx` scene module: it never runs on the server, so the
// module-scope geometry build below is client-only by construction.
import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { useFrame, useThree } from '@octanejs/three';
import { useEffect, useRef } from '@octanejs/three/renderer';
import { FLAME_CREAM, FLAME_CREAM_D, FLAME_RED, FLAME_RED_D } from './flame.ts';

const CREAM_DEPTH = 10;
// The red inner flame is cut deeper so it stands proud of both cream faces,
// like an inlay, instead of z-fighting inside the cream volume.
const RED_DEPTH = 14;

const DRAG_SENS = 0.007; // rad per px of horizontal drag
const TILT_SENS = 0.005; // rad per px of vertical drag
const MAX_TILT = 0.9; // keep the flame from flipping upside down
const IDLE_SPIN = 0.45; // rad/s once inertia settles
const MAX_FLING = 5; // rad/s cap on release velocity

function extrudeFlame(d: string, depth: number): THREE.ExtrudeGeometry {
	const parsed = new SVGLoader().parse(
		'<svg xmlns="http://www.w3.org/2000/svg"><path d="' + d + '"/></svg>',
	);
	const shapes = parsed.paths.flatMap((path) => SVGLoader.createShapes(path));
	return new THREE.ExtrudeGeometry(shapes, {
		depth,
		bevelEnabled: true,
		bevelThickness: 1.2,
		bevelSize: 1,
		bevelSegments: 3,
		curveSegments: 16,
	});
}

const creamGeometry = extrudeFlame(FLAME_CREAM_D, CREAM_DEPTH);
const redGeometry = extrudeFlame(FLAME_RED_D, RED_DEPTH);
// Center the pair on the cream flame's bounds so the group rotates around the
// mark's visual center; the red inlay shares the offset (plus half its extra
// depth) so it protrudes evenly front and back.
redGeometry.translate(0, 0, -(RED_DEPTH - CREAM_DEPTH) / 2);
creamGeometry.computeBoundingBox();
const flameCenter = creamGeometry.boundingBox!.getCenter(new THREE.Vector3());
creamGeometry.translate(-flameCenter.x, -flameCenter.y, -flameCenter.z);
redGeometry.translate(-flameCenter.x, -flameCenter.y, -flameCenter.z);

interface DragState {
	dragging: boolean;
	px: number;
	py: number;
	dx: number;
	dy: number;
	vx: number;
	vy: number;
	reduced: boolean;
}

export function SpinScene() @{
	const group = useRef<THREE.Group>(null);
	const gl = useThree((state) => state.gl);
	const invalidate = useThree((state) => state.invalidate);
	const setFrameloop = useThree((state) => state.setFrameloop);
	const drag = useRef<DragState>({
		dragging: false,
		px: 0,
		py: 0,
		dx: 0,
		dy: 0,
		vx: 0,
		vy: IDLE_SPIN,
		reduced: false,
	});

	useEffect(() => {
		const canvas = gl.domElement;
		const state = drag.current;
		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
		let onScreen = true;

		// 'always' only while the canvas is on screen AND motion is welcome;
		// otherwise 'demand', where the only renders are the ones dragging
		// invalidates.
		const applyFrameloop = () => {
			state.reduced = reduced.matches;
			setFrameloop(onScreen && !reduced.matches ? 'always' : 'demand');
			invalidate();
		};

		// pan-y keeps vertical page scrolling alive on touch; horizontal drags
		// belong to the flame.
		canvas.style.touchAction = 'pan-y';
		canvas.style.cursor = 'grab';

		const onPointerDown = (event: PointerEvent) => {
			if (!event.isPrimary) return;
			state.dragging = true;
			state.px = event.clientX;
			state.py = event.clientY;
			canvas.setPointerCapture(event.pointerId);
			canvas.style.cursor = 'grabbing';
		};
		const onPointerMove = (event: PointerEvent) => {
			if (!state.dragging || !event.isPrimary) return;
			state.dx += (event.clientX - state.px) * DRAG_SENS;
			state.dy += (event.clientY - state.py) * TILT_SENS;
			state.px = event.clientX;
			state.py = event.clientY;
			invalidate();
		};
		const onPointerUp = (event: PointerEvent) => {
			if (!event.isPrimary) return;
			state.dragging = false;
			canvas.style.cursor = 'grab';
		};

		canvas.addEventListener('pointerdown', onPointerDown);
		canvas.addEventListener('pointermove', onPointerMove);
		canvas.addEventListener('pointerup', onPointerUp);
		canvas.addEventListener('pointercancel', onPointerUp);
		reduced.addEventListener('change', applyFrameloop);
		const observer = new IntersectionObserver(([entry]) => {
			onScreen = entry.isIntersecting;
			applyFrameloop();
		});
		observer.observe(canvas);
		applyFrameloop();

		return () => {
			canvas.removeEventListener('pointerdown', onPointerDown);
			canvas.removeEventListener('pointermove', onPointerMove);
			canvas.removeEventListener('pointerup', onPointerUp);
			canvas.removeEventListener('pointercancel', onPointerUp);
			reduced.removeEventListener('change', applyFrameloop);
			observer.disconnect();
		};
	});

	useFrame((_state, delta) => {
		const flame = group.current;
		if (flame === null) return;
		const state = drag.current;
		if (state.dragging) {
			// Apply the accumulated pointer deltas directly (frame-rate and
			// frameloop-mode independent) and remember the instantaneous
			// velocity so release keeps the momentum.
			flame.rotation.y += state.dx;
			flame.rotation.x += state.dy;
			if (delta > 0) {
				state.vy = THREE.MathUtils.clamp(state.dx / delta, -MAX_FLING, MAX_FLING);
				state.vx = THREE.MathUtils.clamp(state.dy / delta, -MAX_FLING, MAX_FLING);
			}
			state.dx = 0;
			state.dy = 0;
		} else {
			// Ease the fling velocity back toward the idle spin (or a full stop
			// under reduced motion) and level the tilt back out.
			const settle = Math.min(1, delta * 1.6);
			state.vy += ((state.reduced ? 0 : IDLE_SPIN) - state.vy) * settle;
			state.vx += (0 - state.vx) * settle;
			flame.rotation.y += state.vy * delta;
			flame.rotation.x += state.vx * delta;
			flame.rotation.x += (0 - flame.rotation.x) * Math.min(1, delta * 0.8);
		}
		flame.rotation.x = THREE.MathUtils.clamp(flame.rotation.x, -MAX_TILT, MAX_TILT);
	});

	<>
		<ambientLight intensity={0.55} />
		<directionalLight position={[70, 110, 160]} intensity={2.4} />
		<directionalLight position={[-90, -30, -140]} intensity={1.1} color={FLAME_RED} />
		<group ref={group} rotation={[0.12, -0.35, 0]}>
			{/* SVG y grows downward; the negative y scale flips the mark upright
    (the renderer flips winding for negative-determinant transforms,
    so lighting stays correct). */}
			<group scale={[1, -1, 1]}>
				<mesh geometry={creamGeometry}>
					<meshStandardMaterial color={FLAME_CREAM} roughness={0.34} metalness={0.12} />
				</mesh>
				<mesh geometry={redGeometry}>
					<meshStandardMaterial
						color={FLAME_RED}
						roughness={0.4}
						metalness={0.05}
						emissive={FLAME_RED}
						emissiveIntensity={0.18}
					/>
				</mesh>
			</group>
		</group>
	</>
}
