export type Ref<ElementType = HTMLElement> =
	| RefObject<ElementType | null>
	| ForwardedRef<ElementType | null>
	| ((element: ElementType | null) => void);

export function assignRef<ElementType = HTMLElement>(
	ref: Ref<ElementType>,
	node: ElementType | null,
) {
	if (typeof ref === 'function') {
		ref(node);
	} else if (ref && typeof ref === 'object' && 'current' in ref) {
		ref.current = node;
	}
}

export function assignRefs<ElementType = HTMLElement>(
	refs: Ref<ElementType>[],
	node: ElementType | null,
) {
	refs.forEach((ref) => {
		assignRef<ElementType>(ref, node);
	});
}
