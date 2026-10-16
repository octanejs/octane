export const DOM_BINDING_DIRECTIVE = 'use dom bindings';

export function isDomBindingDirective(node) {
	return node?.type === 'ExpressionStatement' && node.expression?.value === DOM_BINDING_DIRECTIVE;
}
