import {
	animateVisualElement,
	setTarget,
	type AnimationDefinition,
	type LegacyAnimationControls,
	type Transition,
	type VisualElement,
} from 'motion-dom';
import { useLayoutEffect, useState } from 'octane';

const STATE = Symbol.for('octane-motion:animation-controls-state');
const MOUNT = Symbol.for('octane-motion:animation-controls-mount');

export function stopVisualElement(visual: VisualElement): void {
	visual.values.forEach((value) => value.stop());
}

function createAnimationControls(): LegacyAnimationControls {
	const subscribers = new Set<VisualElement>();
	let mounted = false;
	const controls: LegacyAnimationControls = {
		subscribe(visual: VisualElement) {
			subscribers.add(visual);
			return () => subscribers.delete(visual);
		},
		start(definition: AnimationDefinition, transitionOverride?: Transition) {
			if (!mounted) throw new Error('Animation controls must be mounted before start().');
			return Promise.all(
				Array.from(subscribers, (visual) =>
					animateVisualElement(visual, definition, { transitionOverride }),
				),
			);
		},
		set(definition: AnimationDefinition) {
			if (!mounted) throw new Error('Animation controls must be mounted before set().');
			for (const visual of subscribers) {
				if (Array.isArray(definition)) {
					for (const label of [...definition].reverse()) setTarget(visual, label);
				} else setTarget(visual, definition);
				visual.render();
			}
		},
		stop() {
			for (const visual of subscribers) stopVisualElement(visual);
		},
		mount() {
			mounted = true;
			return () => {
				mounted = false;
				controls.stop();
			};
		},
	};
	return controls;
}

export function useAnimationControls(): LegacyAnimationControls {
	const [controls] = useState(createAnimationControls, STATE);
	useLayoutEffect(() => controls.mount(), [controls], MOUNT);
	return controls;
}
