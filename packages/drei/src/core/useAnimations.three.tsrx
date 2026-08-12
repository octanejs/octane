import { useFrame, type RefObject } from '@octanejs/three';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from '@octanejs/three/renderer';
import { AnimationAction, AnimationClip, AnimationMixer, Object3D } from 'three';
import { slotDefault } from './compiler-slot.js';

type Api<T extends AnimationClip> = {
	ref: RefObject<Object3D | undefined | null>;
	clips: AnimationClip[];
	mixer: AnimationMixer;
	names: T['name'][];
	actions: { [key in T['name']]: AnimationAction | null };
};

export function useAnimations<T extends AnimationClip>(
	clips: T[],
	root?: RefObject<Object3D | undefined | null> | Object3D,
): Api<T> {
	root = slotDefault(root, undefined);
	const ref = useRef<Object3D | null>(null);
	const [actualRef] = useState(
		() => root ? (root instanceof Object3D ? { current: root } : root) : ref,
	);
	const [mixer] = useState(() => new AnimationMixer(undefined as unknown as Object3D));
	useLayoutEffect(() => {
		if (root) actualRef.current = root instanceof Object3D ? root : root.current;
		(mixer as AnimationMixer & { _root: Object3D | null | undefined })._root = actualRef.current;
	});
	const lazyActions = useRef<Record<string, AnimationAction>>({});
	const api = useMemo<Api<T>>(() => {
		const actions = {} as { [key in T['name']]: AnimationAction | null };
		clips.forEach(
			(clip) => Object.defineProperty(actions, clip.name, {
				enumerable: true,
				get() {
					if (actualRef.current) {
						return lazyActions.current[clip.name] ||
							(lazyActions.current[clip.name] = mixer.clipAction(clip, actualRef.current));
					}
				},
				configurable: true,
			}),
		);
		return { ref: actualRef, clips, actions, names: clips.map((clip) => clip.name), mixer };
	}, [clips]);
	useFrame((_, delta) => mixer.update(delta));
	useEffect(() => {
		const currentRoot = actualRef.current;
		return () => {
			lazyActions.current = {};
			mixer.stopAllAction();
			Object.values(api.actions).forEach((action) => {
				if (currentRoot) mixer.uncacheAction(action as unknown as AnimationClip, currentRoot);
			});
		};
	}, [clips]);
	return api;
}
