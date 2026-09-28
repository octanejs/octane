// Copied from @lexical/react/src/shared/LexicalReactGeneratedJSON.ts (0.51.0, MIT).
// Upstream generates this from DecoratorBlockNode's `json` schema; it is copied
// unchanged apart from repository formatting, and must be re-copied rather than
// hand-edited when that schema changes.

// Generated upstream by scripts/generate-node-json.mjs from each class's `json`
// schema.

// Keys are emitted in the order the schema-driven walk writes them, so the two
// produce byte-identical JSON. That order is the schema's, not alphabetical.

import type { DecoratorBlockNode } from '../LexicalDecoratorBlockNode';
import type { GeneratedJSONFactory } from 'lexical';

/**
 * DecoratorBlockNode's schema-declared fields, for a clone. Generated from that
 * schema; do not edit by hand.
 *
 * @internal
 */
export function afterCloneDecoratorBlockNode(
	node: DecoratorBlockNode,
	prevNode: DecoratorBlockNode,
): void {
	node.__format = prevNode.__format;
}

/** DecoratorBlockNode's generated implementations, for its `$config`. @internal */
export const GENERATED_DECORATORBLOCK: GeneratedJSONFactory = () => {
	/** Generated from DecoratorBlockNode's serialization schema. Do not edit by hand. */
	function exportDecoratorBlockNode(node: DecoratorBlockNode): {
		[key: string]: unknown;
	} {
		return {
			format: node.__format,
			type: node.__type,
			version: 1,
		};
	}

	/** Generated from DecoratorBlockNode's serialization schema. Do not edit by hand. */
	function exportCompactDecoratorBlockNode(node: DecoratorBlockNode): {
		[key: string]: unknown;
	} {
		const json: { [key: string]: unknown } = { type: node.__type };
		const format = node.__format;
		if (format !== undefined && format !== '') {
			json.format = format;
		}
		return json;
	}

	/** Generated from DecoratorBlockNode's serialization schema. Do not edit by hand. */
	function updateDecoratorBlockNode(
		node: DecoratorBlockNode,
		json: { readonly [key: string]: unknown },
	): DecoratorBlockNode {
		const format = json.format;
		node.__format =
			format === '' ||
			format === 'left' ||
			format === 'start' ||
			format === 'center' ||
			format === 'right' ||
			format === 'end' ||
			format === 'justify'
				? format
				: '';
		return node;
	}

	return {
		exportJSON: exportDecoratorBlockNode,
		exportCompactJSON: exportCompactDecoratorBlockNode,
		updateFromJSON: updateDecoratorBlockNode,
		afterCloneFrom: afterCloneDecoratorBlockNode,
	};
};
