import { useFrame, useGraph, useInstanceHandle, useStore, useThree } from '@octanejs/three';
import { useLayoutEffect, useRef } from '@octanejs/three/renderer';

export function HookScene(props) @{
	const objectRef = useRef(null);
	const instanceRef = useInstanceHandle(objectRef);
	const store = useStore();
	const selectedWidth = useStore((state) => state.size.width);
	const scene = useThree((state) => state.scene);
	const selection = useThree(
		(state) => ({ width: state.size.width, height: state.size.height }),
		props.equalSelection,
	);
	const graph = useGraph(props.graph);

	useFrame((state, delta) => {
		props.onFrame({ state, delta, object: objectRef.current, instance: instanceRef.current });
	}, props.priority);

	useLayoutEffect(() => {
		props.onLayout({
			store,
			selectedWidth,
			scene,
			selection,
			graph,
			object: objectRef.current,
			instance: instanceRef.current,
			instanceHandle: instanceRef,
		});
	}, [store, selectedWidth, scene, selection, graph, props.onLayout, objectRef, instanceRef]);

	<group ref={objectRef} name="hook-root" />
}
