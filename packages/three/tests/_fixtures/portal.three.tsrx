import { createPortal, useFrame, useStore, useThree } from '@octanejs/three';
import { createContext, use, useLayoutEffect } from '@octanejs/three/renderer';
import type * as THREE from 'three';

export const PortalTheme = createContext('default');

function PortalContent(props) @{
	const store = useStore();
	const state = useThree();
	const theme = use(PortalTheme);

	useFrame((frameState, delta) => props.onFrame(frameState, delta));
	useLayoutEffect(() => {
		props.onLayout({
			store,
			state,
			theme,
			cameraAspect: (state.camera as THREE.PerspectiveCamera).aspect,
		});
	}, [store, state, theme, props.onLayout]);

	<group
		name="portal-parent"
		ref={props.parentRef}
		attach={props.attach}
		onUpdate={props.onUpdate}
		onPointerDown={props.onParentPointerDown}
	>
		<mesh name="portal-mesh" ref={props.meshRef} onPointerDown={props.onMeshPointerDown}>
			<boxGeometry ref={props.geometryRef} />
			<meshBasicMaterial />
		</mesh>
	</group>
}

export function PortalScene(props) @{
	<PortalTheme.Provider value={props.theme}>
		<group
			name="ordinary-root-child"
			ref={props.logicalTargetRef}
			onPointerDown={props.onTargetPointerDown}
		/>
		@if (props.show) {
			<>
				{createPortal(
					<PortalContent
						parentRef={props.parentRef}
						meshRef={props.meshRef}
						geometryRef={props.geometryRef}
						onLayout={props.onLayout}
						onFrame={props.onFrame}
						attach={props.attach}
						onUpdate={props.onUpdate}
						onParentPointerDown={props.onParentPointerDown}
						onMeshPointerDown={props.onMeshPointerDown}
					/>,
					props.target,
					props.portalState,
				)}
			</>
		}
	</PortalTheme.Provider>
}

function NestedPortalLayer(props) @{
	const store = useStore();
	const state = useThree();
	const theme = use(PortalTheme);
	useLayoutEffect(() => {
		props.onOuterLayout({ store, state, theme });
	}, [store, state, theme, props.onOuterLayout]);

	<>
		<group name="outer-portal-child" />
		{createPortal(
			<PortalContent
				parentRef={props.parentRef}
				meshRef={props.meshRef}
				geometryRef={props.geometryRef}
				onLayout={props.onInnerLayout}
				onFrame={props.onFrame}
			/>,
			props.innerTarget,
			props.innerState,
		)}
	</>
}

export function NestedPortalScene(props) @{
	<PortalTheme.Provider value={props.theme}>
		<>
			{createPortal(
				<NestedPortalLayer
					innerTarget={props.innerTarget}
					innerState={props.innerState}
					parentRef={props.parentRef}
					meshRef={props.meshRef}
					geometryRef={props.geometryRef}
					onOuterLayout={props.onOuterLayout}
					onInnerLayout={props.onInnerLayout}
					onFrame={props.onFrame}
				/>,
				props.outerTarget,
				props.outerState,
			)}
		</>
	</PortalTheme.Provider>
}

function ManagedTargetPortalContent(props) @{
	const store = useStore();
	useLayoutEffect(() => {
		props.onStore(store);
	}, [store, props.onStore]);

	<group name="managed-target-portal-child" ref={props.portalRef} />
}

export function ManagedTargetPortalScene(props) @{
	<>
		<primitive object={props.managedObject} ref={props.targetRef} />
		@if (props.portalTarget !== null) {
			<>
				{createPortal(
					<ManagedTargetPortalContent portalRef={props.portalRef} onStore={props.onStore} />,
					props.portalTarget,
				)}
			</>
		}
	</>
}

export function PortalCycleScene(props) @{
	<>
		{createPortal(<primitive object={props.first} />, props.second)}
		{createPortal(<primitive object={props.second} />, props.first)}
	</>
}

function PortalEventLayer(props) @{
	<mesh name={props.name} ref={props.meshRef} onPointerDown={props.onPointerDown}>
		<boxGeometry />
		<meshBasicMaterial />
	</mesh>
}

export function PortalEventLayersScene(props) @{
	<>
		{createPortal(
			<PortalEventLayer
				name="low-priority-portal"
				meshRef={props.lowRef}
				onPointerDown={props.onLowPointerDown}
			/>,
			props.lowTarget,
			props.lowState,
		)}
		{createPortal(
			<PortalEventLayer
				name="high-priority-portal"
				meshRef={props.highRef}
				onPointerDown={props.onHighPointerDown}
			/>,
			props.highTarget,
			props.highState,
		)}
	</>
}

function PortalOwnedChild(props) @{
	useLayoutEffect(() => {
		props.onEffect('mount');
		return () => props.onEffect('cleanup');
	}, [props.onEffect]);
	if (props.fail) throw new Error('portal-owned-boom');

	<group name="portal-owned-child" />
}

export function PortalOwnershipScene(props) @{
	@try {
		<>
			{createPortal(<PortalOwnedChild fail={props.fail} onEffect={props.onEffect} />, props.target)}
		</>
	} @catch (error) {
		<group name={'caught:' + error.message} ref={props.fallbackRef} />
	}
}
