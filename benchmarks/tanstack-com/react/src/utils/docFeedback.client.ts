/**
 * Client-side utilities for doc feedback
 * These functions run in the browser to identify and track document blocks
 */

import { sha256Hex } from './hash';

// Re-export shared utilities
export { calculatePoints } from './docFeedback.shared';

export interface BlockIdentifier {
	selector: string;
	contentHash: string;
	elementPath: Array<{ tag: string; index: number }>;
}

/**
 * Generate a hierarchical selector for a DOM element
 * Returns selector like: "section[1] > h2[0] > p[2]"
 */
export function generateBlockSelector(element: HTMLElement): string {
	const path: Array<{ tag: string; index: number }> = [];
	let current: HTMLElement | null = element;

	// Walk up to the nearest content container (or max 5 levels)
	let depth = 0;
	while (current && depth < 5) {
		const tag = current.tagName.toLowerCase();
		const parent: HTMLElement | null = current.parentElement;

		// Skip feedback wrapper elements
		if (current.hasAttribute('data-feedback-wrapper')) {
			current = parent;
			continue;
		}

		if (parent) {
			// Find index among siblings with same tag (excluding feedback wrappers)
			const siblings = Array.from(parent.children).filter(
				(child: Element) =>
					child.tagName.toLowerCase() === tag && !child.hasAttribute('data-feedback-wrapper'),
			);
			const index = siblings.indexOf(current);

			path.unshift({ tag, index });
		} else {
			path.unshift({ tag, index: 0 });
		}

		// Stop at article or main content containers
		if (tag === 'article' || tag === 'main' || current.hasAttribute('data-doc-content')) {
			break;
		}

		current = parent;
		depth++;
	}

	return path.map((el) => `${el.tag}[${el.index}]`).join(' > ');
}

/**
 * Generate SHA-256 hash of element's text content
 */
export async function generateContentHash(element: HTMLElement): Promise<string> {
	const content = element.textContent?.trim() || '';
	return sha256Hex(content);
}

/**
 * Get a complete block identifier for a DOM element
 */
export async function getBlockIdentifier(element: HTMLElement): Promise<BlockIdentifier> {
	const selector = generateBlockSelector(element);
	const contentHash = await generateContentHash(element);

	// Parse selector back to element path for storage
	const elementPath = selector.split(' > ').map((part) => {
		const match = part.match(/^(\w+)\[(\d+)\]$/);
		if (!match) return { tag: 'div', index: 0 };
		return { tag: match[1], index: parseInt(match[2], 10) };
	});

	return {
		selector,
		contentHash,
		elementPath,
	};
}

/**
 * Find all referenceable blocks on the current page
 * Returns elements that can have feedback attached
 */
export function findReferenceableBlocks(container?: HTMLElement): HTMLElement[] {
	const root = container || document;

	// Find all block-level elements in the prose content
	// This includes headings, paragraphs, lists, code blocks, blockquotes, etc.
	const selectors = [
		// Headings
		'h1',
		'h2',
		'h3',
		'h4',
		'h5',
		'h6',
		// Content blocks
		'p',
		// Lists
		'ul',
		'ol',
		// Code blocks
		'pre',
		// Blockquotes
		'blockquote',
		// Tables
		'table',
		// Divs that are direct children of prose content
		'div.prose > div',
		// Sections
		'section',
	];

	const elements: HTMLElement[] = [];

	selectors.forEach((selector) => {
		root.querySelectorAll(selector).forEach((el) => {
			if (el instanceof HTMLElement) {
				// Skip if element is inside another referenceable element (to avoid nesting)
				const isNested = elements.some((existing) => existing.contains(el));
				if (!isNested) {
					// Skip if element is inside an editor portal or note portal
					const isInsidePortal = el.closest('[data-editor-portal], [data-note-portal]') !== null;
					if (!isInsidePortal) {
						// Skip very small elements (likely empty or decorative)
						const text = el.textContent?.trim() || '';
						if (text.length > 10) {
							elements.push(el);
						}
					}
				}
			}
		});
	});

	return elements;
}

/**
 * Find a block element by its selector
 * Returns null if not found or selector doesn't match content hash
 */
export async function findBlockBySelector(
	selector: string,
	expectedHash?: string,
): Promise<{ element: HTMLElement; isDetached: boolean } | null> {
	try {
		// Parse selector and try to find element
		const parts = selector.split(' > ');
		let current: Element | null = document.documentElement;

		for (const part of parts) {
			const match = part.match(/^(\w+)\[(\d+)\]$/);
			if (!match) return null;

			const [, tag, indexStr] = match;
			const index = parseInt(indexStr, 10);

			if (!current) return null;

			const children: Element[] = Array.from(current.children).filter(
				(child: Element) => child.tagName.toLowerCase() === tag,
			);

			if (index >= children.length) {
				// Element not found at expected position - detached
				return null;
			}

			current = children[index];
		}

		if (!(current instanceof HTMLElement)) return null;

		// Verify content hash if provided
		if (expectedHash) {
			const actualHash = await generateContentHash(current);
			const isDetached = actualHash !== expectedHash;
			return { element: current, isDetached };
		}

		return { element: current, isDetached: false };
	} catch (error) {
		console.error('Error finding block by selector:', error);
		return null;
	}
}

/**
 * Get position of element relative to viewport for scroll-to functionality
 */
export function getElementScrollPosition(element: HTMLElement): number {
	const rect = element.getBoundingClientRect();
	const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
	return rect.top + scrollTop - 100; // 100px offset for header
}

/**
 * Scroll to a specific block element smoothly
 */
export function scrollToBlock(element: HTMLElement): void {
	const position = getElementScrollPosition(element);
	window.scrollTo({
		top: position,
		behavior: 'smooth',
	});
}

/**
 * Highlight a block element temporarily (visual feedback)
 */
export function highlightBlock(element: HTMLElement, duration: number = 2000): void {
	const originalBg = element.style.backgroundColor;
	const originalTransition = element.style.transition;

	element.style.transition = 'background-color 0.3s ease';
	element.style.backgroundColor = 'rgba(59, 130, 246, 0.1)'; // blue-500 with opacity

	setTimeout(() => {
		element.style.backgroundColor = originalBg;
		setTimeout(() => {
			element.style.transition = originalTransition;
		}, 300);
	}, duration);
}
