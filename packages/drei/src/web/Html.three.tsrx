/** @jsxImportSource @octanejs/three/intrinsics */
import {
	DOMRegion,
	type RefObject,
	type ThreeElements,
	type ThreeRef,
	useFrame,
	useThree,
} from '@octanejs/three';
import {
	useImperativeHandle,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from '@octanejs/three/renderer';
import type { OctaneNode } from 'octane';
import type { RendererRegion } from 'octane/universal';
import {
	Camera,
	DoubleSide,
	Group,
	Matrix4,
	Mesh,
	Object3D,
	OrthographicCamera,
	PerspectiveCamera,
	Raycaster,
	Vector2,
	Vector3,
	WebGLRenderer,
} from 'three';

const v1 = new Vector3();
const v2 = new Vector3();
const v3 = new Vector3();
const v4 = new Vector2();

export function defaultCalculatePosition(
	el: Object3D,
	camera: Camera,
	size: { width: number; height: number },
): [number, number] {
	const objectPos = v1.setFromMatrixPosition(el.matrixWorld).project(camera);
	return [
		objectPos.x * (size.width / 2) + size.width / 2,
		-objectPos.y * (size.height / 2) + size.height / 2,
	];
}

export type CalculatePosition = typeof defaultCalculatePosition;
export type PointerEventsProperties = CSSStyleDeclaration['pointerEvents'];

export interface HtmlProps extends Omit<ThreeElements['group'], 'children' | 'ref'> {
	children?: OctaneNode;
	ref?: ThreeRef<HTMLDivElement>;
	prepend?: boolean;
	center?: boolean;
	fullscreen?: boolean;
	eps?: number;
	portal?: RefObject<HTMLElement | null>;
	distanceFactor?: number;
	sprite?: boolean;
	transform?: boolean;
	zIndexRange?: [number, number] | number[];
	calculatePosition?: CalculatePosition;
	as?: keyof HTMLElementTagNameMap | string;
	wrapperClass?: string;
	className?: string;
	style?: Partial<CSSStyleDeclaration> & Record<string, unknown>;
	pointerEvents?: PointerEventsProperties;
	occlude?: RefObject<Object3D | null>[] | boolean | 'raycast' | 'blending';
	onOcclude?: (hidden: boolean) => void;
	material?: OctaneNode;
	geometry?: OctaneNode;
	castShadow?: boolean;
	receiveShadow?: boolean;
}

function isObjectBehindCamera(el: Object3D, camera: Camera): boolean {
	const delta = v1
		.setFromMatrixPosition(el.matrixWorld)
		.sub(v2.setFromMatrixPosition(camera.matrixWorld));
	return delta.angleTo(camera.getWorldDirection(v3)) > Math.PI / 2;
}

function isObjectVisible(
	el: Object3D,
	camera: Camera,
	raycaster: Raycaster,
	occlude: Object3D[],
): boolean {
	const position = v1.setFromMatrixPosition(el.matrixWorld);
	const projected = position.clone().project(camera);
	raycaster.setFromCamera(v4.set(projected.x, projected.y), camera);
	const intersection = raycaster.intersectObjects(occlude, true)[0];
	return !intersection || position.distanceTo(raycaster.ray.origin) < intersection.distance;
}

function objectScale(el: Object3D, camera: Camera): number {
	if (camera instanceof OrthographicCamera) return camera.zoom;
	if (!(camera instanceof PerspectiveCamera)) return 1;
	const distance = v1
		.setFromMatrixPosition(el.matrixWorld)
		.distanceTo(v2.setFromMatrixPosition(camera.matrixWorld));
	return 1 / (2 * Math.tan((camera.fov * Math.PI) / 360) * distance);
}

function objectZIndex(el: Object3D, camera: Camera, range: readonly number[]): number | undefined {
	if (!(camera instanceof PerspectiveCamera || camera instanceof OrthographicCamera)) return undefined;
	const distance = v1
		.setFromMatrixPosition(el.matrixWorld)
		.distanceTo(v2.setFromMatrixPosition(camera.matrixWorld));
	const slope = (range[1] - range[0]) / (camera.far - camera.near);
	return Math.round(slope * distance + range[1] - slope * camera.far);
}

const epsilon = (value: number) => (Math.abs(value) < 1e-10 ? 0 : value);

function cssMatrix(matrix: Matrix4, multipliers: number[], prepend = ''): string {
	return `${prepend}matrix3d(${matrix.elements
		.map((value, index) => epsilon(value * multipliers[index]))
		.join(',')})`;
}

const cameraMultipliers = [1, -1, 1, 1, 1, -1, 1, 1, 1, -1, 1, 1, 1, -1, 1, 1];
const objectMultipliers = (factor: number) => [
	1 / factor, 1 / factor, 1 / factor, 1,
	-1 / factor, -1 / factor, -1 / factor, -1,
	1 / factor, 1 / factor, 1 / factor, 1,
	1, 1, 1, 1,
];

const NON_TRANSFORM_VERTEX_SHADER = `
  /*
    This shader is from the THREE's SpriteMaterial.
    We need to turn the backing plane into a Sprite
    (make it always face the camera) if "transfrom"
    is false.
  */
  #include <common>

  void main() {
    vec2 center = vec2(0., 1.);
    float rotation = 0.0;

    // This is somewhat arbitrary, but it seems to work well
    // Need to figure out how to derive this dynamically if it even matters
    float size = 0.03;

    vec4 mvPosition = modelViewMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
    vec2 scale;
    scale.x = length( vec3( modelMatrix[ 0 ].x, modelMatrix[ 0 ].y, modelMatrix[ 0 ].z ) );
    scale.y = length( vec3( modelMatrix[ 1 ].x, modelMatrix[ 1 ].y, modelMatrix[ 1 ].z ) );

    bool isPerspective = isPerspectiveMatrix( projectionMatrix );
    if ( isPerspective ) scale *= - mvPosition.z;

    vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale * size;
    vec2 rotatedPosition;
    rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;
    rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;
    mvPosition.xy += rotatedPosition;

    gl_Position = projectionMatrix * mvPosition;
  }
`;

const TRANSPARENT_FRAGMENT_SHADER = `
  void main() {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
  }
`;

function assignStyle(element: HTMLElement, style: HtmlProps['style']): void {
	if (!style) return;
	for (const [key, value] of Object.entries(style)) {
		if (value !== undefined && value !== null) (element.style as any)[key] = value;
	}
}

export function Html({
	children,
	ref: forwardedRef,
	eps = 0.001,
	style,
	className,
	prepend,
	center,
	fullscreen,
	portal,
	distanceFactor,
	sprite = false,
	transform = false,
	occlude,
	onOcclude,
	castShadow,
	receiveShadow,
	material,
	geometry,
	zIndexRange = [16777271, 0],
	calculatePosition = defaultCalculatePosition,
	as = 'div',
	wrapperClass,
	pointerEvents = 'auto',
	...props
}: HtmlProps) @{
	const state = useThree();
	const [el] = useState(() => document.createElement(as));
	const [transformOuter] = useState(() => document.createElement('div'));
	const [transformInner] = useState(() => document.createElement('div'));
	const group = useRef<Group | null>(null);
	const content = useRef<HTMLDivElement | null>(null);
	const mesh = useRef<Mesh | null>(null);
	const visible = useRef(true);
	const oldZoom = useRef(0);
	const oldPosition = useRef<[number, number]>([0, 0]);
	const meshSized = useRef(false);
	const isRaycastOcclusion = useMemo(
		() => Boolean(occlude && occlude !== 'blending'),
		[occlude],
	);
	const canvas = (state.gl as unknown as WebGLRenderer).domElement;
	const target = (portal?.current ?? state.events.connected ?? canvas.parentNode) as HTMLElement;
	const regionTarget = transform ? transformInner : el;

	useImperativeHandle(
		(forwardedRef ?? null) as any,
		() => content.current!,
		[el],
	);

	useLayoutEffect(() => {
		const canvas = (state.gl as unknown as WebGLRenderer).domElement as HTMLCanvasElement;
		if (occlude === 'blending') {
			canvas.style.zIndex = `${Math.floor(zIndexRange[0] / 2)}`;
			canvas.style.position = 'absolute';
			canvas.style.pointerEvents = 'none';
		} else {
			canvas.style.zIndex = '';
			canvas.style.position = '';
			canvas.style.pointerEvents = '';
		}
	}, [state.gl, occlude, zIndexRange]);

	useLayoutEffect(() => {
		state.scene.updateMatrixWorld();
		if (transform) {
			el.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;overflow:hidden;';
			if (transformOuter.parentElement !== el) el.append(transformOuter);
			if (transformInner.parentElement !== transformOuter) transformOuter.append(transformInner);
		}
		else {
			transformOuter.remove();
			const position = group.current
				? calculatePosition(group.current, state.camera, state.size)
				: [0, 0];
			el.style.cssText = `position:absolute;top:0;left:0;transform:translate3d(${position[0]}px,${position[1]}px,0);transform-origin:0 0;`;
		}
		if (prepend) target.prepend(el);
		else target.append(el);
		return () => el.remove();
	}, [target, transform, prepend, el, transformOuter, transformInner, state.scene, state.camera, state.size, calculatePosition]);

	useLayoutEffect(() => {
		if (wrapperClass) el.className = wrapperClass;
		meshSized.current = false;
		const node = content.current;
		if (!node) return;
		node.className = className ?? '';
		if (transform) {
			transformOuter.style.cssText = `position:absolute;top:0;left:0;width:${state.size.width}px;height:${state.size.height}px;transform-style:preserve-3d;pointer-events:none;`;
			transformInner.style.cssText = `position:absolute;pointer-events:${pointerEvents};`;
			node.style.cssText = '';
		} else {
			node.style.cssText = `position:absolute;transform:${center ? 'translate3d(-50%,-50%,0)' : 'none'};`;
		}
		if (!transform && fullscreen) {
			node.style.top = `${-state.size.height / 2}px`;
			node.style.left = `${-state.size.width / 2}px`;
			node.style.width = `${state.size.width}px`;
			node.style.height = `${state.size.height}px`;
		}
		assignStyle(node, style);
	}, [el, transformOuter, transformInner, wrapperClass, className, style, center, fullscreen, transform, pointerEvents, state.size]);

	useFrame(() => {
		const object = group.current;
		if (!object) return;
		state.camera.updateMatrixWorld();
		object.updateWorldMatrix(true, false);
		const position = transform ? oldPosition.current : calculatePosition(object, state.camera, state.size);
		if (
			transform ||
			Math.abs(oldZoom.current - state.camera.zoom) > eps ||
			Math.abs(oldPosition.current[0] - position[0]) > eps ||
			Math.abs(oldPosition.current[1] - position[1]) > eps
		) {
			let shown = !isObjectBehindCamera(object, state.camera);
			if (shown && isRaycastOcclusion) {
				const targets = Array.isArray(occlude)
					? occlude.map((item) => item.current).filter((item): item is Object3D => item !== null)
					: [state.scene];
				shown = isObjectVisible(object, state.camera, state.raycaster, targets);
			}
			if (visible.current !== shown) {
				visible.current = shown;
				if (onOcclude) onOcclude(!shown);
				else el.style.display = shown ? 'block' : 'none';
			}
			const half = Math.floor(zIndexRange[0] / 2);
			const range = occlude
				? isRaycastOcclusion ? [zIndexRange[0], half] : [half - 1, 0]
				: zIndexRange;
			el.style.zIndex = `${objectZIndex(object, state.camera, range)}`;
			if (transform) {
				const fov = state.camera.projectionMatrix.elements[5] * state.size.height / 2;
				const camera = state.camera as OrthographicCamera;
				const cameraTransform = camera.isOrthographicCamera
					? `scale(${fov})translate(${epsilon(-(camera.right + camera.left) / 2)}px,${epsilon((camera.top + camera.bottom) / 2)}px)`
					: `translateZ(${fov}px)`;
				let matrix = object.matrixWorld;
				if (sprite) {
					matrix = state.camera.matrixWorldInverse.clone().transpose().copyPosition(matrix).scale(object.scale);
					matrix.elements[3] = matrix.elements[7] = matrix.elements[11] = 0;
					matrix.elements[15] = 1;
				}
				el.style.width = `${state.size.width}px`;
				el.style.height = `${state.size.height}px`;
				el.style.perspective = camera.isOrthographicCamera ? '' : `${fov}px`;
				transformOuter.style.transform = `${cameraTransform}${cssMatrix(state.camera.matrixWorldInverse, cameraMultipliers)}translate(${state.size.width / 2}px,${state.size.height / 2}px)`;
				transformInner.style.transform = cssMatrix(
					matrix,
					objectMultipliers(1 / ((distanceFactor || 10) / 400)),
					'translate(-50%,-50%)',
				);
			} else {
				const scale = distanceFactor === undefined ? 1 : objectScale(object, state.camera) * distanceFactor;
				el.style.transform = `translate3d(${position[0]}px,${position[1]}px,0) scale(${scale})`;
			}
			oldPosition.current = position;
			oldZoom.current = state.camera.zoom;
		}

		const plane = mesh.current;
		const node = content.current;
		if (!isRaycastOcclusion && plane && !meshSized.current) {
			if (transform) {
				const measured = transformOuter.children[0] as HTMLElement | undefined;
				if (measured?.clientWidth && measured.clientHeight) {
					const camera = state.camera as OrthographicCamera;
					if (camera.isOrthographicCamera || geometry) {
						if (props.scale) {
							if (!Array.isArray(props.scale)) plane.scale.setScalar(1 / (props.scale as number));
							else if (props.scale instanceof Vector3) plane.scale.copy(props.scale.clone().divideScalar(1));
							else plane.scale.set(1 / props.scale[0], 1 / props.scale[1], 1 / props.scale[2]);
						}
					} else {
						const ratio = (distanceFactor || 10) / 400;
						plane.scale.set(measured.clientWidth * ratio, measured.clientHeight * ratio, 1);
					}
					meshSized.current = true;
				}
			} else {
				if (node?.clientWidth && node.clientHeight) {
					const ratio = 1 / state.viewport.factor;
					plane.scale.set(node.clientWidth * ratio, node.clientHeight * ratio, 1);
					meshSized.current = true;
				}
				plane.lookAt(state.camera.position);
			}
		}
	});

	<group {...props} ref={group}>
		<DOMRegion target={regionTarget} region={children as RendererRegion} containerRef={content} />
		@if (occlude && !isRaycastOcclusion) {
			<mesh ref={mesh} castShadow={castShadow} receiveShadow={receiveShadow}>
				@if (geometry) { {geometry} } @else { <planeGeometry /> }
				@if (material) { {material} } @else {
					<shaderMaterial
						side={DoubleSide}
						vertexShader={transform ? undefined : NON_TRANSFORM_VERTEX_SHADER}
						fragmentShader={TRANSPARENT_FRAGMENT_SHADER}
					/>
				}
			</mesh>
		}
	</group>
}
