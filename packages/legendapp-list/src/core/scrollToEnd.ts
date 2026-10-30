import { scrollToIndex } from './scrollToIndex.ts';
import { peek$, type StateContext } from '../state/state.ts';
import type { ScrollToEndOptions } from '../types.base.ts';

export function scrollToEnd(ctx: StateContext, options?: ScrollToEndOptions) {
	const state = ctx.state;
	const data = state.props.data;
	const index = data.length - 1;
	if (index === -1) {
		return false;
	}

	const paddingBottom = state.props.stylePaddingBottom || 0;
	const footerSize = peek$(ctx, 'footerSize') || 0;
	scrollToIndex(ctx, {
		...options,
		index,
		viewOffset: -paddingBottom - footerSize + (options?.viewOffset || 0),
		viewPosition: 1,
	});
	return true;
}
