import type { HTML, Root } from 'mdast';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';

// Convert HTML nodes to text when rehype-raw is not present
// This allows HTML to be displayed as escaped text instead of being stripped
export const remarkEscapeHtml: Plugin<[], Root> = () => (tree) => {
	visit(tree, 'html', (node: HTML, index, parent) => {
		/* v8 ignore next */
		if (!parent || typeof index !== 'number') {
			return;
		}

		// Convert HTML node to text so the renderer handles escaping
		parent.children[index] = {
			type: 'text',
			value: node.value,
		};
	});
};
