// Ported verbatim from .base-ui/packages/react/src/floating-ui-react/utils/createAttribute.ts.
export function createAttribute(name: string): string {
	return `data-base-ui-${name}`;
}
