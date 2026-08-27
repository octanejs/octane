interface CollectionItem<TNode> {
	ref: { current: TNode | null };
}

export function sortCollectionItemsByDomOrder<TNode, TItem extends CollectionItem<TNode>>(
	orderedNodes: readonly TNode[],
	items: TItem[],
): TItem[] {
	return items.sort(
		(a, b) => orderedNodes.indexOf(a.ref.current!) - orderedNodes.indexOf(b.ref.current!),
	);
}
