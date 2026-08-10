import type { LiveQueryDef, Store } from '@livestore/livestore';
import { computed } from '@livestore/livestore';
import { memo, useEffect, useMemo, useState } from 'octane';
import type { OctaneNode } from 'octane';
import { useQuery } from '../../useQuery';

export type LiveListProps<TItem> = {
	items$: LiveQueryDef<ReadonlyArray<TItem>>;
	renderItem: (item: TItem, options: { index: number; isInitialListRender: boolean }) => OctaneNode;
	getKey: (item: TItem, index: number) => string | number;
	store: Store<any, any>;
};

type ItemWrapperProps<TItem> = {
	itemKey: string | number;
	item$: LiveQueryDef<TItem>;
	index: number;
	isInitialListRender: boolean;
	renderItem: LiveListProps<TItem>['renderItem'];
	store: Store<any, any>;
};

export function LiveList<TItem>({ items$, renderItem, getKey, store }: LiveListProps<TItem>) @{
	const [hasMounted, setHasMounted] = useState(false);
	useEffect(() => setHasMounted(true), []);
	const keys = useQuery(computed((get) => get(items$).map(getKey)), { store });
	const entries = useMemo(
		() => keys.map(
			(key, index) => ({
				key,
				index,
				item$: computed((get) => get(items$).find((item) => getKey(item, 0) === key)!, {
					deps: [key],
				}) as LiveQueryDef<TItem>,
			}),
		),
		[getKey, items$, keys],
	);

	<>
		@for (const entry of entries; key entry.key) {
			<ItemWrapperMemo
				itemKey={entry.key}
				item$={entry.item$}
				store={store}
				index={entry.index}
				isInitialListRender={!hasMounted}
				renderItem={renderItem}
			/>
		}
	</>
}

function ItemWrapper<TItem>({
	item$,
	index,
	isInitialListRender,
	renderItem,
	store,
}: ItemWrapperProps<TItem>) @{
	const item = useQuery(item$, { store });
	const options = useMemo(() => ({ index, isInitialListRender }), [index, isInitialListRender]);
	<>
		{renderItem(item, options)}
	</>
}

const ItemWrapperMemo = memo(
	ItemWrapper,
	(previous, next) =>
		previous.itemKey === next.itemKey && previous.renderItem === next.renderItem &&
			previous.store === next.store &&
			previous.index === next.index &&
			previous.isInitialListRender === next.isInitialListRender,
) as typeof ItemWrapper;
