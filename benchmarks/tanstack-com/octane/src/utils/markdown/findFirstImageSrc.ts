import type { InlineNode } from '@tanstack/markdown';
import type { MarkdownDocument } from './processor';

export function findFirstImageSrc(document: MarkdownDocument): string | undefined {
	for (const block of document.children) {
		if (block.type === 'paragraph' || block.type === 'heading') {
			const found = findFirstImageSrcInInline(block.children);
			if (found) return found;
		} else if (block.type !== 'thematicBreak' && block.type !== 'html') {
			// Every current blog post's hero image is a bare top-level paragraph;
			// stop rather than reach into lists/tables/blockquotes/tab panels,
			// where a "first" image may not even be visible on initial paint.
			return undefined;
		}
	}
	return undefined;
}

function findFirstImageSrcInInline(nodes: InlineNode[]): string | undefined {
	for (const node of nodes) {
		if (node.type === 'image') return node.src;
		if ('children' in node) {
			const found = findFirstImageSrcInInline(node.children);
			if (found) return found;
		}
	}
	return undefined;
}
