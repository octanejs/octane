import type { OctaneNode } from 'octane';

import { peek$, type StateContext } from '../state/state.ts';
import { isNullOrUndefined } from './helpers.ts';

export function getRenderedItem(ctx: StateContext, key: string) {
	const state = ctx.state;
	if (!state) {
		return null;
	}

	const {
		indexByKey,
		props: { data, getItemType, renderItem },
	} = state;

	const index = indexByKey.get(key);

	if (index === undefined) {
		return null;
	}

	let renderedItem: OctaneNode = null;

	const extraData = peek$(ctx, 'extraData');

	const item = data[index];
	if (renderItem && !isNullOrUndefined(item)) {
		const itemProps = {
			data,
			extraData,
			index,
			item,
			type: getItemType ? (getItemType(item, index) ?? '') : '',
		};

		renderedItem = renderItem(itemProps) as OctaneNode;
	}

	return { index, item: data[index], renderedItem };
}
