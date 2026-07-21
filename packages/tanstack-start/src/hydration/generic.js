// media / condition / interaction hydration strategies — port of
// @tanstack/react-start-client's hydration/generic.ts. The gating logic lives
// in @tanstack/start-client-core; these factories just attach octane's
// GenericHydrate renderer.
import {
	condition as coreCondition,
	interaction as coreInteraction,
	media as coreMedia,
	withHydrationRenderer,
} from '@tanstack/start-client-core/hydration';
import { GenericHydrate } from '../GenericHydrate.tsrx';

/* @__NO_SIDE_EFFECTS__ */
export function media(query) {
	return /* @__PURE__ */ withHydrationRenderer(coreMedia(query), GenericHydrate);
}

/* @__NO_SIDE_EFFECTS__ */
export function condition(condition) {
	return /* @__PURE__ */ withHydrationRenderer(coreCondition(condition), GenericHydrate);
}

/* @__NO_SIDE_EFFECTS__ */
export function interaction(options) {
	return /* @__PURE__ */ withHydrationRenderer(coreInteraction(options), GenericHydrate);
}
