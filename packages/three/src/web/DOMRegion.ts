import {
	defineUniversalComponent,
	universalPlan,
	universalProps,
	universalValue,
	useLayoutEffect,
	useMemo,
	type RendererRegion,
} from 'octane/universal';
import { Object3D } from 'three';
import { createDOMRegionBinding, type DOMRegionTarget } from './dom-region.js';

export type { DOMRegionTarget } from './dom-region.js';

export interface DOMRegionProps {
	/** Explicit DOM parent for the region's one owned child container. */
	target: DOMRegionTarget;
	/** Compiler-owned DOM renderer region. Application JSX is lowered into this payload. */
	children?: RendererRegion;
}

class DOMRegionSentinel extends Object3D {
	declare region?: RendererRegion;
}

const DOM_REGION_PLAN = universalPlan('three', {
	kind: 'host',
	type: 'primitive',
	propsSlot: 0,
});
const DOM_REGION_BINDING = Symbol('octane.three.dom-region.binding');
const DOM_REGION_SENTINEL = Symbol('octane.three.dom-region.sentinel');
const DOM_REGION_LIFETIME = Symbol('octane.three.dom-region.lifetime');
const DOM_REGION_COMMIT = Symbol('octane.three.dom-region.commit');

/**
 * Low-level Three-to-DOM renderer boundary.
 *
 * DOMRegion deliberately provides no positioning, transforms, occlusion, or styling.
 */
export const DOMRegion = defineUniversalComponent<DOMRegionProps>('three', (props) => {
	const binding = useMemo(() => createDOMRegionBinding(), [], DOM_REGION_BINDING);
	const sentinel = useMemo(() => new DOMRegionSentinel(), [], DOM_REGION_SENTINEL);
	useLayoutEffect(() => binding.attach(), [binding], DOM_REGION_LIFETIME);
	useLayoutEffect(
		() => binding.commit(props.target, props.children),
		[binding, props.target, props.children],
		DOM_REGION_COMMIT,
	);

	return universalValue(DOM_REGION_PLAN, [
		universalProps([
			['set', 'object', sentinel],
			['set', 'dispose', null],
			['set', 'region', props.children],
		]),
	]);
});
