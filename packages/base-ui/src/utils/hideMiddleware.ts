// Ported from .base-ui/packages/react/src/utils/hideMiddleware.ts (v1.6.0). Base UI imports the
// native `hide` from `@floating-ui/react-dom`; octane's `@octanejs/floating-ui` re-exports the same
// `@floating-ui/dom` `hide`, so we wrap that. Adds an extra "anchor hidden" heuristic: a reference
// rect that is fully zeroed (width/height/x/y all 0) is treated as hidden even if native `hide`
// doesn't flag it.
import { hide as nativeHide } from '@octanejs/floating-ui';

const nativeHideFn = (nativeHide() as any).fn;

export const hide: any = {
	name: 'hide',
	async fn(state: any) {
		const { width, height, x, y } = state.rects.reference;
		const anchorHidden = width === 0 && height === 0 && x === 0 && y === 0;
		const nativeHideResult = await nativeHideFn(state);
		return {
			data: {
				referenceHidden: nativeHideResult.data?.referenceHidden || anchorHidden,
			},
		};
	},
};
