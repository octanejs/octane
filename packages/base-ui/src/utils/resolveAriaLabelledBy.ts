// Ported verbatim from .base-ui/packages/react/src/utils/resolveAriaLabelledBy.ts.
export function getDefaultLabelId(id: string | null | undefined) {
	return id == null ? undefined : `${id}-label`;
}

export function resolveAriaLabelledBy(
	fieldLabelId: string | undefined,
	localLabelId: string | undefined,
) {
	return fieldLabelId ?? localLabelId;
}
