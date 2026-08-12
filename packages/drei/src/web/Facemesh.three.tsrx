/** @jsxImportSource @octanejs/three/intrinsics */
import * as THREE from 'three';
import { type ThreeElements, type ThreeRef, useThree } from '@octanejs/three';
import {
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
	type RefObject,
} from '@octanejs/three/renderer';

import { Line } from '../core/lines.three.tsrx';
import { FacemeshDatas } from './facemesh-data.js';

export { FacemeshDatas } from './facemesh-data.js';

export type MediaPipeFaceMesh = typeof FacemeshDatas.SAMPLE_FACE;

export type MediaPipePoints =
	| typeof FacemeshDatas.SAMPLE_FACE.keypoints
	| (typeof FacemeshDatas.SAMPLE_FACELANDMARKER_RESULT.faceLandmarks)[0];

export type FacemeshProps =
	{
		/** an array of 468+ keypoints as returned by google/mediapipe tasks-vision, default: a sample face */
		points?: MediaPipePoints;
		/** @deprecated an face object as returned by tensorflow/tfjs-models face-landmarks-detection */
		face?: MediaPipeFaceMesh;
		/** constant width of the mesh, default: undefined */
		width?: number;
		/** or constant height of the mesh, default: undefined */
		height?: number;
		/** or constant depth of the mesh, default: 1 */
		depth?: number;
		/** a landmarks tri supposed to be vertical, default: [159, 386, 200] (see: https://github.com/tensorflow/tfjs-models/tree/master/face-landmarks-detection#mediapipe-facemesh-keypoints) */
		verticalTri?: [number, number, number];
		/** a landmark index (to get the position from) or a vec3 to be the origin of the mesh. default: undefined (ie. the bbox center) */
		origin?: number | THREE.Vector3;
		/** A facial transformation matrix, as returned by FaceLandmarkerResult.facialTransformationMatrixes (see: https://developers.google.com/mediapipe/solutions/vision/face_landmarker/web_js#handle_and_display_results) */
		facialTransformationMatrix?: (typeof FacemeshDatas.SAMPLE_FACELANDMARKER_RESULT.facialTransformationMatrixes)[0];
		/** Apply position offset extracted from `facialTransformationMatrix` */
		offset?: boolean;
		/** Offset sensitivity factor, less is more sensible */
		offsetScalar?: number;
		/** Fface blendshapes, as returned by FaceLandmarkerResult.faceBlendshapes (see: https://developers.google.com/mediapipe/solutions/vision/face_landmarker/web_js#handle_and_display_results) */
		faceBlendshapes?: (typeof FacemeshDatas.SAMPLE_FACELANDMARKER_RESULT.faceBlendshapes)[0];
		/** whether to enable eyes (nb. `faceBlendshapes` is required for), default: true */
		eyes?: boolean;
		/** Force `origin` to be the middle of the 2 eyes (nb. `eyes` is required for), default: false */
		eyesAsOrigin?: boolean;
		/** debug mode, default: false */
		debug?: boolean;
	} & Omit<ThreeElements['group'], 'ref'>;

export type FacemeshApi = {
	meshRef: RefObject<THREE.Mesh | null>;
	outerRef: RefObject<THREE.Group | null>;
	eyeRightRef: RefObject<FacemeshEyeApi | null>;
	eyeLeftRef: RefObject<FacemeshEyeApi | null>;
};

const defaultLookAt = /* @__PURE__ */ new THREE.Vector3(0, 0, -1);

const normal = /* @__PURE__ */ (function () {
	const a = new THREE.Vector3();
	const b = new THREE.Vector3();
	const c = new THREE.Vector3();
	const ab = new THREE.Vector3();
	const ac = new THREE.Vector3();

	return function (
		v1: THREE.Vector3,
		v2: THREE.Vector3,
		v3: THREE.Vector3,
		v: THREE.Vector3, // result
	) {
		a.copy(v1);
		b.copy(v2);
		c.copy(v3);

		ab.copy(b).sub(a);
		ac.copy(c).sub(a);

		return v.crossVectors(ac, ab).normalize();
	};
})();

function mean(v1: THREE.Vector3, v2: THREE.Vector3) {
	return v1.clone().add(v2).multiplyScalar(0.5);
}

export function Facemesh({
	points = FacemeshDatas.SAMPLE_FACELANDMARKER_RESULT.faceLandmarks[0],
	face,
	facialTransformationMatrix,
	faceBlendshapes,
	offset,
	offsetScalar = 80,
	width,
	height,
	depth = 1,
	verticalTri = [159, 386, 152],
	origin,
	eyes = true,
	eyesAsOrigin = false,
	debug = false,
	children,
	ref,
	...props
}: FacemeshProps & { ref?: ThreeRef<FacemeshApi> }) @{
	if (face) {
		points = face.keypoints;
		console.warn('Facemesh `face` prop is deprecated: use `points` instead');
	}

	const offsetRef = useRef<THREE.Group | null>(null);
	const scaleRef = useRef<THREE.Group | null>(null);
	const originRef = useRef<THREE.Group | null>(null);
	const outerRef = useRef<THREE.Group | null>(null);
	const meshRef = useRef<THREE.Mesh | null>(null);
	const eyeRightRef = useRef<FacemeshEyeApi | null>(null);
	const eyeLeftRef = useRef<FacemeshEyeApi | null>(null);

	const [sightDir] = useState(() => new THREE.Vector3());
	const [transform] = useState(() => new THREE.Object3D());
	const [sightDirQuaternion] = useState(() => new THREE.Quaternion());
	const [_origin] = useState(() => new THREE.Vector3());

	const { invalidate } = useThree();

	useEffect(() => {
		meshRef.current?.geometry.setIndex(FacemeshDatas.TRIANGULATION);
	}, []);

	const [bboxSize] = useState(() => new THREE.Vector3());

	useEffect(() => {
		const faceGeometry = meshRef.current?.geometry;
		if (!faceGeometry) return;

		faceGeometry.setFromPoints(points as THREE.Vector3[]);
		faceGeometry.setDrawRange(0, FacemeshDatas.TRIANGULATION.length);

		//
		// A. compute sightDir vector
		//
		//  - either from `facialTransformationMatrix` if available
		//  - or from `verticalTri`
		//

		if (facialTransformationMatrix) {
			// from facialTransformationMatrix
			transform.matrix.fromArray(facialTransformationMatrix.data);
			transform.matrix.decompose(transform.position, transform.quaternion, transform.scale);

			// Rotation: y and z axes are inverted
			transform.rotation.y *= -1;
			transform.rotation.z *= -1;
			sightDirQuaternion.setFromEuler(transform.rotation);

			// Offset: y and z axes are inverted
			if (offset) {
				transform.position.y *= -1;
				transform.position.z *= -1;
				offsetRef.current?.position.copy(transform.position.divideScalar(offsetScalar));
			} else {
				offsetRef.current?.position.set(0, 0, 0); // reset
			}
		} else {
			// normal to verticalTri
			normal(
				points[verticalTri[0]] as THREE.Vector3,
				points[verticalTri[1]] as THREE.Vector3,
				points[verticalTri[2]] as THREE.Vector3,
				sightDir,
			);

			sightDirQuaternion.setFromUnitVectors(defaultLookAt, sightDir);
		}

		const sightDirQuaternionInverse = sightDirQuaternion.clone().invert();

		//
		// B. geometry (straightened)
		//

		// 1. center (before rotate back)
		faceGeometry.computeBoundingBox();
		if (debug) invalidate(); // invalidate to force re-render for box3Helper (after .computeBoundingBox())
		faceGeometry.center();

		// 2. rotate back + rotate outerRef (once 1.)
		faceGeometry.applyQuaternion(sightDirQuaternionInverse);
		outerRef.current?.setRotationFromQuaternion(sightDirQuaternion);

		// 3. 👀 eyes
		if (eyes) {
			if (!faceBlendshapes) {
				console.warn(
					'Facemesh `eyes` option only works if `faceBlendshapes` is provided: skipping.',
				);
			} else {
				if (eyeRightRef.current && eyeLeftRef.current && originRef.current) {
					if (eyesAsOrigin) {
						// compute the middle of the 2 eyes as the `origin`
						const eyeRightSphere = eyeRightRef.current._computeSphere(faceGeometry);
						const eyeLeftSphere = eyeLeftRef.current._computeSphere(faceGeometry);
						const eyesCenter = mean(eyeRightSphere.center, eyeLeftSphere.center);
						origin = eyesCenter.negate(); // eslint-disable-line react-hooks/exhaustive-deps

						eyeRightRef.current._update(faceGeometry, faceBlendshapes, eyeRightSphere);
						eyeLeftRef.current._update(faceGeometry, faceBlendshapes, eyeLeftSphere);
					} else {
						eyeRightRef.current._update(faceGeometry, faceBlendshapes);
						eyeLeftRef.current._update(faceGeometry, faceBlendshapes);
					}
				}
			}
		}

		// 3. origin
		if (originRef.current) {
			if (origin !== undefined) {
				if (typeof origin === 'number') {
					const position = faceGeometry.getAttribute('position') as THREE.BufferAttribute;
					_origin.set(-position.getX(origin), -position.getY(origin), -position.getZ(origin));
				} else if (origin.isVector3) {
					_origin.copy(origin);
				}
			} else {
				_origin.setScalar(0);
			}

			originRef.current.position.copy(_origin);
		}

		// 4. re-scale
		if (scaleRef.current) {
			let scale = 1;
			if (width || height || depth) {
				faceGeometry.boundingBox!.getSize(bboxSize);
				if (width) scale = width / bboxSize.x; // fit in width
				if (height) scale = height / bboxSize.y; // fit in height
				if (depth) scale = depth / bboxSize.z; // fit in depth
			}

			scaleRef.current.scale.setScalar(scale !== 1 ? scale : 1);
		}

		faceGeometry.computeVertexNormals();
		faceGeometry.attributes.position.needsUpdate = true;
	}, [
		points,
		facialTransformationMatrix,
		faceBlendshapes,
		transform,
		offset,
		offsetScalar,
		width,
		height,
		depth,
		verticalTri,
		origin,
		eyes,
		debug,
		invalidate,
		sightDir,
		sightDirQuaternion,
		bboxSize,
		_origin,
	]);

	//
	// API
	//

	const api = useMemo<FacemeshApi>(
		() => ({ outerRef, meshRef, eyeRightRef, eyeLeftRef }),
		[],
	);
	useImperativeHandle((ref ?? null) as any, () => api, [api]);

	const [meshBboxSize] = useState(() => new THREE.Vector3());
	const bbox = meshRef.current?.geometry.boundingBox;
	const one = bbox?.getSize(meshBboxSize).z || 1;
	<group {...props}>
		<group ref={offsetRef}>
			<group ref={outerRef}>
				<group ref={scaleRef}>
					{debug
						? <>
								<axesHelper args={[one]} />
								<Line
									points={[
										[0, 0, 0],
										[0, 0, -one],
									]}
									color={0x00ffff}
								/>
							</>
						: null}

					<group ref={originRef}>
						{eyes && faceBlendshapes &&
							<group name="eyes">
								<FacemeshEye side="left" ref={eyeRightRef} debug={debug} />
								<FacemeshEye side="right" ref={eyeLeftRef} debug={debug} />
							</group>}
						<mesh ref={meshRef} name="face">
							{children}

							{debug
								? <>
										{bbox && <box3Helper args={[bbox]} />}
									</>
								: null}
						</mesh>
					</group>
				</group>
			</group>
		</group>
	</group>
}

//
// 👁️ FacemeshEye
//

export type FacemeshEyeProps = {
	side: 'left' | 'right';
	debug?: boolean;
};
export type FacemeshEyeApi = {
	eyeMeshRef: RefObject<THREE.Group | null>;
	irisDirRef: RefObject<THREE.Group | null>;
	_computeSphere: (faceGeometry: THREE.BufferGeometry) => THREE.Sphere;
	_update: (faceGeometry: THREE.BufferGeometry, faceBlendshapes: FacemeshProps['faceBlendshapes'], sphere?: THREE.Sphere) => void;
};

export const FacemeshEyeDefaults = {
	contourLandmarks: {
		right: [33, 133, 159, 145, 153],
		left: [263, 362, 386, 374, 380],
	},
	blendshapes: {
		right: [14, 16, 18, 12], // lookIn,lookOut, lookUp,lookDown
		left: [13, 15, 17, 11], // lookIn,lookOut, lookUp,lookDown
	},
	color: {
		right: 'red',
		left: '#00ff00',
	},
	fov: {
		horizontal: 100,
		vertical: 90,
	},
};

export function FacemeshEye({ side, debug = true, ref }: FacemeshEyeProps & {
	ref?: ThreeRef<FacemeshEyeApi>;
}) @{
	const eyeMeshRef = useRef<THREE.Group | null>(null);
	const irisDirRef = useRef<THREE.Group | null>(null);

	//
	// _computeSphere()
	//
	// Compute eye's sphere .position and .radius
	//

	const [sphere] = useState(() => new THREE.Sphere());
	const _computeSphere = useCallback<FacemeshEyeApi['_computeSphere']>((faceGeometry) => {
		const position = faceGeometry.getAttribute('position') as THREE.BufferAttribute;

		// get some eye contour landmarks points (from geometry)
		const eyeContourLandmarks = FacemeshEyeDefaults.contourLandmarks[side];
		const eyeContourPoints = eyeContourLandmarks.map(
			(i) => new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i)),
		); // prettier-ignore

		// compute center (centroid from eyeContourPoints)
		sphere.center.set(0, 0, 0);
		eyeContourPoints.forEach((v) => sphere.center.add(v));
		sphere.center.divideScalar(eyeContourPoints.length);

		// radius (eye half-width)
		sphere.radius = eyeContourPoints[0].sub(eyeContourPoints[1]).length() / 2;

		return sphere;
	}, [sphere, side]);

	//
	// _update()
	//
	// Update:
	//   - A. eye's mesh (according to sphere)
	//   - B. iris direction (according to "look*" blendshapes)
	//

	const [rotation] = useState(() => new THREE.Euler());
	const _update = useCallback<FacemeshEyeApi['_update']>((
		faceGeometry,
		faceBlendshapes,
		sphere,
	) => {
		// A.
		if (eyeMeshRef.current) {
			sphere ??= _computeSphere(faceGeometry); // compute sphere dims (if not passed)
			eyeMeshRef.current.position.copy(sphere.center);
			eyeMeshRef.current.scale.setScalar(sphere.radius);
		}

		// B.
		if (faceBlendshapes && irisDirRef.current) {
			const blendshapes = FacemeshEyeDefaults.blendshapes[side];

			const lookIn = faceBlendshapes.categories[blendshapes[0]].score;
			const lookOut = faceBlendshapes.categories[blendshapes[1]].score;
			const lookUp = faceBlendshapes.categories[blendshapes[2]].score;
			const lookDown = faceBlendshapes.categories[blendshapes[3]].score;

			const hfov = FacemeshEyeDefaults.fov.horizontal * THREE.MathUtils.DEG2RAD;
			const vfov = FacemeshEyeDefaults.fov.vertical * THREE.MathUtils.DEG2RAD;
			const rx = hfov * 0.5 * (lookDown - lookUp);
			const ry = vfov * 0.5 * (lookIn - lookOut) * (side === 'left' ? 1 : -1);
			rotation.set(rx, ry, 0);

			irisDirRef.current.setRotationFromEuler(rotation);
		}
	}, [_computeSphere, side, rotation]);

	//
	// API
	//

	const api = useMemo<FacemeshEyeApi>(
		() => ({ eyeMeshRef, irisDirRef, _computeSphere, _update }),
		[_computeSphere, _update],
	);
	useImperativeHandle((ref ?? null) as any, () => api, [api]);

	const color = FacemeshEyeDefaults.color[side];
	<group>
		<group ref={eyeMeshRef}>
			{debug && <axesHelper />}

			<group ref={irisDirRef}>
				<>
					{debug &&
						<Line
							points={[
								[0, 0, 0],
								[0, 0, -2],
							]}
							lineWidth={1}
							color={color}
						/>}
				</>
			</group>
		</group>
	</group>
}
