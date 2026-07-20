import { sha256Hex } from './hash';

export { calculatePoints } from './docFeedback.shared';

export interface BlockIdentifier {
	selector: string;
	contentHash: string;
	elementPath: Array<{ tag: string; index: number }>;
}

export function generateBlockSelector(element: HTMLElement) {
	const path: Array<{ tag: string; index: number }> = [];
	let current: HTMLElement | null = element;
	let depth = 0;

	while (current && depth < 5) {
		const tag = current.tagName.toLowerCase();
		const parent: HTMLElement | null = current.parentElement;

		if (current.hasAttribute('data-feedback-wrapper')) {
			current = parent;
			continue;
		}

		if (parent) {
			const siblings = Array.from(parent.children).filter(
				(child: Element) =>
					child.tagName.toLowerCase() === tag && !child.hasAttribute('data-feedback-wrapper'),
			);
			const index = siblings.indexOf(current);

			path.unshift({ tag, index });
		} else {
			path.unshift({ tag, index: 0 });
		}

		if (tag === 'article' || tag === 'main' || current.hasAttribute('data-doc-content')) {
			break;
		}

		current = parent;
		depth++;
	}

	return path.map((el) => `${el.tag}[${el.index}]`).join(' > ');
}

export async function generateContentHash(element: HTMLElement) {
	const content = element.textContent?.trim() || '';
	return sha256Hex(content);
}

export async function getBlockIdentifier(element: HTMLElement): Promise<BlockIdentifier> {
	const selector = generateBlockSelector(element);
	const contentHash = await generateContentHash(element);
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

export function findReferenceableBlocks(container?: HTMLElement) {
	const root = container || document;
	const selectors = [
		'h1',
		'h2',
		'h3',
		'h4',
		'h5',
		'h6',
		'p',
		'ul',
		'ol',
		'pre',
		'blockquote',
		'table',
		'div.prose > div',
		'section',
	];

	const elements: Array<HTMLElement> = [];

	selectors.forEach((selector) => {
		root.querySelectorAll(selector).forEach((el) => {
			if (el instanceof HTMLElement) {
				const isNested = elements.some((existing) => existing.contains(el));
				if (!isNested) {
					const isInsidePortal = el.closest('[data-editor-portal], [data-note-portal]') !== null;
					if (!isInsidePortal) {
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

export async function findBlockBySelector(selector: string, expectedHash?: string) {
	try {
		const parts = selector.split(' > ');
		let current: Element | null = document.documentElement;

		for (const part of parts) {
			const match = part.match(/^(\w+)\[(\d+)\]$/);
			if (!match) return null;

			const [, tag, indexStr] = match;
			const index = parseInt(indexStr, 10);

			if (!current) return null;

			const children: Array<Element> = Array.from(current.children).filter(
				(child: Element) => child.tagName.toLowerCase() === tag,
			);

			if (index >= children.length) {
				return null;
			}

			current = children[index];
		}

		if (!(current instanceof HTMLElement)) return null;

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

export function getElementScrollPosition(element: HTMLElement) {
	const rect = element.getBoundingClientRect();
	const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
	return rect.top + scrollTop - 100;
}

export function scrollToElement(element: HTMLElement, behavior: ScrollBehavior = 'smooth') {
	const top = getElementScrollPosition(element);
	window.scrollTo({ top, behavior });
}
