interface CollectionItem<TNode> {
	ref: { current: TNode | null };
}

export const COLLECTION_ORDER_INDEX_THRESHOLD = 256;

export function sortCollectionItemsByDomOrder<TNode, TItem extends CollectionItem<TNode>>(
	orderedNodes: readonly TNode[],
	items: TItem[],
): TItem[] {
	if (items.length >= COLLECTION_ORDER_INDEX_THRESHOLD) {
		const nodeIndexes = new Map<TNode, number>();
		for (let index = 0; index < orderedNodes.length; index++) {
			nodeIndexes.set(orderedNodes[index], index);
		}
		return items.sort(
			(a, b) => (nodeIndexes.get(a.ref.current!) ?? -1) - (nodeIndexes.get(b.ref.current!) ?? -1),
		);
	}

	return items.sort(
		(a, b) => orderedNodes.indexOf(a.ref.current!) - orderedNodes.indexOf(b.ref.current!),
	);
}
