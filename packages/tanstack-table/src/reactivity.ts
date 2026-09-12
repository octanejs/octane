import { batch, createAtom } from '@octanejs/tanstack-store';
import { renderPhaseReactivity } from '@tanstack/table-core/reactivity';
import type { RenderPhaseReactivityBindings } from '@tanstack/table-core/reactivity';

// Use the same store primitives as external atoms supplied by consumers.
export function octaneReactivity(): RenderPhaseReactivityBindings {
	return renderPhaseReactivity({ createAtom, batch });
}
