/** @jsxImportSource @octanejs/three/intrinsics */
import { type ThreeElements, useThree } from '@octanejs/three';
import { useCallback, useEffect, useReducer, useRef, useState } from '@octanejs/three/renderer';
import { createContext, useContext } from 'octane';
import * as THREE from 'three';
import { SelectionBox } from 'three-stdlib';
import { shallow } from '@octanejs/zustand/shallow';

const SelectionContext = createContext<THREE.Object3D[]>([]);

export type SelectProps =
	Omit<ThreeElements['group'], 'ref'> & {
		multiple?: boolean;
		box?: boolean;
		border?: string;
		backgroundColor?: string;
		onChange?: (selected: THREE.Object3D[]) => void;
		onChangePointerUp?: (selected: THREE.Object3D[]) => void;
		filter?: (selected: THREE.Object3D[]) => THREE.Object3D[];
	};

type Action = { object?: THREE.Object3D | THREE.Object3D[]; shift?: boolean };

export function Select({
	box,
	multiple,
	children,
	onChange,
	onChangePointerUp,
	border = '1px solid #55aaff',
	backgroundColor = 'rgba(75, 160, 255, 0.1)',
	filter: customFilter = (item) => item,
	...props
}: SelectProps) @{
	const [downed, down] = useState(false);
	const { setEvents, camera, raycaster, gl, controls, size, get } = useThree();
	const [hovered, hover] = useState(false);
	const [active, dispatch] = useReducer((state: THREE.Object3D[], { object, shift }: Action) => {
		if (object === undefined) return [];
		if (Array.isArray(object)) return object;
		if (!shift) return state[0] === object ? [] : [object];
		if (state.includes(object)) return state.filter((entry) => entry !== object);
		return [object, ...state];
	}, [] as THREE.Object3D[]);
	useEffect(() => {
		if (downed) onChange?.(active);
		else onChangePointerUp?.(active);
	}, [active, downed]);
	const onClick = useCallback((event: any) => {
		event.stopPropagation();
		dispatch({ object: customFilter([event.object])[0], shift: multiple && event.shiftKey });
	}, []);
	const onPointerMissed = useCallback(() => {
		if (!hovered) dispatch({});
	}, [hovered]);
	const ref = useRef<THREE.Group | null>(null);
	useEffect(() => {
		if (!box || !multiple || !ref.current) return;
		const Selection = SelectionBox as unknown as new (camera: THREE.Camera, scene: THREE.Scene) => SelectionBox;
		const selectionBox = new Selection(camera, ref.current as unknown as THREE.Scene);
		const element = document.createElement('div');
		element.style.pointerEvents = 'none';
		element.style.border = border;
		element.style.backgroundColor = backgroundColor;
		element.style.position = 'fixed';
		const startPoint = new THREE.Vector2();
		const pointTopLeft = new THREE.Vector2();
		const pointBottomRight = new THREE.Vector2();
		const oldRaycasterEnabled = get().events.enabled;
		const oldControlsEnabled = (controls as any)?.enabled;
		let isDown = false;
		function prepareRay(event: PointerEvent, vector: THREE.Vector2) {
			const { offsetX, offsetY } = event;
			vector.set((offsetX / size.width) * 2 - 1, -(offsetY / size.height) * 2 + 1);
		}
		function onSelectStart(event: PointerEvent) {
			if (controls) (controls as any).enabled = false;
			setEvents({ enabled: false });
			down(isDown = true);
			(gl.domElement as HTMLElement).parentElement?.appendChild(element);
			element.style.left = `${event.clientX}px`;
			element.style.top = `${event.clientY}px`;
			element.style.width = '0px';
			element.style.height = '0px';
			startPoint.set(event.clientX, event.clientY);
		}
		function onSelectMove(event: PointerEvent) {
			pointBottomRight.set(
				Math.max(startPoint.x, event.clientX),
				Math.max(startPoint.y, event.clientY),
			);
			pointTopLeft.set(
				Math.min(startPoint.x, event.clientX),
				Math.min(startPoint.y, event.clientY),
			);
			element.style.left = `${pointTopLeft.x}px`;
			element.style.top = `${pointTopLeft.y}px`;
			element.style.width = `${pointBottomRight.x - pointTopLeft.x}px`;
			element.style.height = `${pointBottomRight.y - pointTopLeft.y}px`;
		}
		function onSelectOver() {
			if (isDown) {
				if (controls) (controls as any).enabled = oldControlsEnabled;
				setEvents({ enabled: oldRaycasterEnabled });
				down(isDown = false);
				element.parentElement?.removeChild(element);
			}
		}
		function pointerDown(event: PointerEvent) {
			if (event.shiftKey) {
				onSelectStart(event);
				prepareRay(event, selectionBox.startPoint as unknown as THREE.Vector2);
			}
		}
		let previous: THREE.Mesh[] = [];
		function pointerMove(event: PointerEvent) {
			if (isDown) {
				onSelectMove(event);
				prepareRay(event, selectionBox.endPoint as unknown as THREE.Vector2);
				const allSelected = (selectionBox.select() as unknown as THREE.Object3D[])
					.sort((object) => object.uuid as unknown as number)
					.filter((object): object is THREE.Mesh => (object as THREE.Mesh).isMesh === true);
				if (!shallow(allSelected, previous)) {
					previous = allSelected;
					dispatch({ object: customFilter(allSelected) });
				}
			}
		}
		function pointerUp() {
			if (isDown) onSelectOver();
		}
		document.addEventListener('pointerdown', pointerDown, { passive: true });
		document.addEventListener('pointermove', pointerMove, { passive: true, capture: true });
		document.addEventListener('pointerup', pointerUp, { passive: true });
		return () => {
			document.removeEventListener('pointerdown', pointerDown);
			document.removeEventListener('pointermove', pointerMove, true);
			document.removeEventListener('pointerup', pointerUp);
		};
	}, [size.width, size.height, raycaster, camera, controls, gl]);
	<group
		ref={ref}
		onClick={onClick}
		onPointerOver={() => hover(true)}
		onPointerOut={() => hover(false)}
		onPointerMissed={onPointerMissed}
		{...props}
	>
		<SelectionContext.Provider value={active}>{children}</SelectionContext.Provider>
	</group>
}

export function useSelect(): THREE.Object3D[] {
	return useContext(SelectionContext);
}
