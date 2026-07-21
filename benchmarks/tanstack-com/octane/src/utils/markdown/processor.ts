import { docsMarkdownExtensions } from '@tanstack/markdown/extensions/docs';
import { parseMarkdown } from '@tanstack/markdown/parser';
import type { BlockNode, InlineNode, MarkdownDocument, MarkdownHeading } from '@tanstack/markdown';

export type { MarkdownDocument, MarkdownHeading } from '@tanstack/markdown';

export type SiteMarkdownDocument = MarkdownDocument & {
	headings: Array<MarkdownHeading>;
};

const escapedLessThanToken = '\uE000';
const escapedGreaterThanToken = '\uE001';

export function parseSiteMarkdown(content: string): SiteMarkdownDocument {
	const headingSlugger = createHeadingSlugger();
	const document = parseMarkdown(protectEscapedAngleBrackets(content), {
		allowHtml: true,
		extensions: docsMarkdownExtensions(),
		headingIds: (text) => headingSlugger(restoreEscapedAngleBracketText(text).replace(/[<>]/g, '')),
	});

	restoreEscapedAngleBrackets(document);

	return {
		...document,
		headings: collectHeadings(document),
	};
}

function protectEscapedAngleBrackets(content: string) {
	const lines = content.split('\n');
	const protectedLines: Array<string> = [];
	let fence: { marker: '`' | '~'; size: number } | undefined;

	for (const line of lines) {
		const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/);

		if (fence) {
			protectedLines.push(line);

			if (fenceMatch && fenceMatch[1]?.startsWith(fence.marker.repeat(fence.size))) {
				fence = undefined;
			}

			continue;
		}

		if (fenceMatch) {
			const marker = fenceMatch[1]?.[0];

			if (marker === '`' || marker === '~') {
				fence = {
					marker,
					size: fenceMatch[1]?.length ?? 3,
				};
			}

			protectedLines.push(line);
			continue;
		}

		protectedLines.push(protectEscapedAngleBracketsInLine(line));
	}

	return protectedLines.join('\n');
}

function protectEscapedAngleBracketsInLine(line: string) {
	let result = '';
	let index = 0;
	let inlineCodeFenceSize = 0;

	while (index < line.length) {
		const character = line[index];

		if (character === '`') {
			const fenceSize = countRun(line, index, '`');
			const fence = '`'.repeat(fenceSize);
			result += fence;
			index += fenceSize;

			if (inlineCodeFenceSize === 0) {
				inlineCodeFenceSize = fenceSize;
			} else if (inlineCodeFenceSize === fenceSize) {
				inlineCodeFenceSize = 0;
			}

			continue;
		}

		if (inlineCodeFenceSize === 0 && character === '\\') {
			const nextCharacter = line[index + 1];

			if (nextCharacter === '<') {
				result += escapedLessThanToken;
				index += 2;
				continue;
			}

			if (nextCharacter === '>') {
				result += escapedGreaterThanToken;
				index += 2;
				continue;
			}
		}

		result += character;
		index++;
	}

	return result;
}

function countRun(value: string, start: number, character: string) {
	let index = start;

	while (value[index] === character) {
		index++;
	}

	return index - start;
}

function restoreEscapedAngleBrackets(document: MarkdownDocument) {
	for (const child of document.children) {
		restoreEscapedAngleBracketsInBlock(child);
	}
}

function restoreEscapedAngleBracketsInBlock(block: BlockNode) {
	switch (block.type) {
		case 'heading':
		case 'paragraph':
			restoreEscapedAngleBracketsInInlineNodes(block.children);
			return;
		case 'blockquote':
		case 'callout':
		case 'component':
			for (const child of block.children) {
				restoreEscapedAngleBracketsInBlock(child);
			}
			return;
		case 'list':
			for (const item of block.items) {
				for (const child of item.children) {
					restoreEscapedAngleBracketsInBlock(child);
				}
			}
			return;
		case 'table':
			for (const cell of [...block.header, ...block.rows.flat()]) {
				restoreEscapedAngleBracketsInInlineNodes(cell.children);
			}
			return;
		case 'footnotes':
			for (const item of block.items) {
				for (const child of item.children) {
					restoreEscapedAngleBracketsInBlock(child);
				}
			}
			return;
		case 'code':
		case 'html':
		case 'thematicBreak':
			return;
	}
}

function restoreEscapedAngleBracketsInInlineNodes(nodes: Array<InlineNode>) {
	for (const node of nodes) {
		switch (node.type) {
			case 'text':
				node.value = restoreEscapedAngleBracketText(node.value);
				break;
			case 'strong':
			case 'emphasis':
			case 'strike':
			case 'link':
				restoreEscapedAngleBracketsInInlineNodes(node.children);
				break;
			case 'inlineCode':
			case 'image':
			case 'break':
			case 'inlineHtml':
			case 'footnoteReference':
				break;
		}
	}
}

function restoreEscapedAngleBracketText(value: string) {
	return value.replaceAll(escapedLessThanToken, '<').replaceAll(escapedGreaterThanToken, '>');
}

function collectHeadings(document: MarkdownDocument): Array<MarkdownHeading> {
	const headings: Array<MarkdownHeading> = [];

	collectHeadingsFromBlocks(document.children, headings, undefined, false);

	return headings;
}

function collectHeadingsFromBlocks(
	blocks: Array<BlockNode>,
	headings: Array<MarkdownHeading>,
	framework: string | undefined,
	insideSkippedComponent: boolean,
) {
	for (const block of blocks) {
		switch (block.type) {
			case 'heading': {
				if (!insideSkippedComponent && block.id) {
					const heading: MarkdownHeading = {
						id: block.id,
						text: inlineText(block.children),
						level: block.depth,
					};
					const headingFramework = block.framework ?? framework;

					if (headingFramework) {
						heading.framework = headingFramework;
					}

					headings.push(heading);
				}

				break;
			}
			case 'list':
				for (const item of block.items) {
					collectHeadingsFromBlocks(item.children, headings, framework, insideSkippedComponent);
				}
				break;
			case 'blockquote':
			case 'callout':
				collectHeadingsFromBlocks(block.children, headings, framework, insideSkippedComponent);
				break;
			case 'component': {
				const componentName = block.name.toLowerCase();
				const nextInsideSkippedComponent = insideSkippedComponent || componentName === 'tabs';
				const nextFramework =
					block.tagName === 'md-framework-panel'
						? (block.properties?.['data-framework'] ?? framework)
						: framework;

				collectHeadingsFromBlocks(
					block.children,
					headings,
					nextFramework,
					nextInsideSkippedComponent,
				);
				break;
			}
			case 'paragraph':
			case 'code':
			case 'table':
			case 'footnotes':
			case 'html':
			case 'thematicBreak':
				break;
		}
	}
}

function inlineText(nodes: Array<InlineNode>): string {
	let text = '';

	for (const node of nodes) {
		switch (node.type) {
			case 'text':
			case 'inlineCode':
				text += node.value;
				break;
			case 'strong':
			case 'emphasis':
			case 'strike':
			case 'link':
				text += inlineText(node.children);
				break;
			case 'image':
				text += node.alt;
				break;
			case 'break':
			case 'inlineHtml':
			case 'footnoteReference':
				break;
		}
	}

	return text;
}

function createHeadingSlugger() {
	const seen = new Map<string, number>();

	return (value: string) => {
		const base =
			value
				.toLowerCase()
				.normalize('NFKD')
				.replace(/[\u0300-\u036f]/g, '')
				.replace(/&[a-z0-9#]+;/gi, '')
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-+|-+$/g, '') || 'section';
		const count = seen.get(base) ?? 0;

		seen.set(base, count + 1);

		return count === 0 ? base : `${base}-${count + 1}`;
	};
}
