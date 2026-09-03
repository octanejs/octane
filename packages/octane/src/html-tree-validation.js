/**
 * HTML parser-repair rules used by DEV client and SSR nesting diagnostics.
 *
 * This is intentionally narrower than the full HTML content model: it only
 * lists placements the browser repairs while parsing serialized HTML, because
 * those repairs can change the DOM before hydration. Adapted from Svelte's
 * html-tree-validation module, which Ripple also uses.
 *
 * Copyright (c) 2016-2025 Svelte Contributors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

const autoclosingChildren = {
	li: {
		descendant: ['li'],
		resetBy: [
			'article',
			'aside',
			'blockquote',
			'details',
			'dl',
			'fieldset',
			'figcaption',
			'figure',
			'footer',
			'form',
			'header',
			'main',
			'menu',
			'nav',
			'object',
			'ol',
			'section',
			'table',
			'ul',
		],
	},
	dt: { descendant: ['dt', 'dd'], resetBy: ['dl'] },
	dd: { descendant: ['dt', 'dd'], resetBy: ['dl'] },
	p: {
		descendant: [
			'address',
			'article',
			'aside',
			'blockquote',
			'div',
			'dl',
			'fieldset',
			'footer',
			'form',
			'h1',
			'h2',
			'h3',
			'h4',
			'h5',
			'h6',
			'header',
			'hgroup',
			'hr',
			'main',
			'menu',
			'nav',
			'ol',
			'p',
			'pre',
			'section',
			'table',
			'ul',
		],
		resetBy: ['button', 'object', 'table', 'td', 'th', 'template'],
	},
	rt: { descendant: ['rt', 'rp'] },
	rp: { descendant: ['rt', 'rp'] },
	optgroup: { descendant: ['optgroup'] },
	option: { descendant: ['option', 'optgroup'] },
	thead: { direct: ['tbody', 'tfoot'] },
	tbody: { direct: ['tbody', 'tfoot'] },
	tfoot: { direct: ['tbody'] },
	tr: { direct: ['tr', 'tbody'] },
	td: { direct: ['td', 'th', 'tr'] },
	th: { direct: ['td', 'th', 'tr'] },
};

const disallowedChildren = {
	...autoclosingChildren,
	form: { descendant: ['form'] },
	a: { descendant: ['a'], resetBy: ['object', 'table', 'td', 'th', 'template'] },
	button: { descendant: ['button'], resetBy: ['object', 'table', 'td', 'th', 'template'] },
	h1: { descendant: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] },
	h2: { descendant: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] },
	h3: { descendant: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] },
	h4: { descendant: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] },
	h5: { descendant: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] },
	h6: { descendant: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] },
	tr: { only: ['th', 'td', 'style', 'script', 'template'] },
	select: { only: ['hr', 'option', 'optgroup', 'script', 'template'] },
	optgroup: { only: ['option'] },
	option: { only: [] },
	tbody: { only: ['tr', 'style', 'script', 'template'] },
	thead: { only: ['tr', 'style', 'script', 'template'] },
	tfoot: { only: ['tr', 'style', 'script', 'template'] },
	colgroup: { only: ['col', 'template'] },
	table: {
		only: ['caption', 'colgroup', 'tbody', 'thead', 'tfoot', 'style', 'script', 'template'],
	},
	head: {
		only: [
			'base',
			'basefont',
			'bgsound',
			'link',
			'meta',
			'title',
			'noscript',
			'noframes',
			'style',
			'script',
			'template',
		],
	},
	html: { only: ['head', 'body', 'frameset'] },
	frameset: { only: ['frame'] },
	'#document': { only: ['html'] },
};

function elementLabel(tag, location) {
	return location ? `\`<${tag}>\` (${location})` : `\`<${tag}>\``;
}

/** Return a diagnostic when `childTag` causes an ancestor to be repaired. */
export function invalidHtmlNestingWithAncestor(
	childTag,
	ancestors,
	childLocation,
	ancestorLocation,
) {
	if (childTag.includes('-')) return null;

	const ancestorTag = ancestors[ancestors.length - 1];
	const disallowed = disallowedChildren[ancestorTag];
	if (!disallowed) return null;

	if ('resetBy' in disallowed && disallowed.resetBy) {
		for (let i = ancestors.length - 2; i >= 0; i--) {
			const ancestor = ancestors[i];
			if (ancestor.includes('-')) return null;
			if (disallowed.resetBy.includes(ancestor)) return null;
		}
	}

	if ('descendant' in disallowed && disallowed.descendant.includes(childTag)) {
		return `${elementLabel(childTag, childLocation)} cannot be a descendant of ${elementLabel(ancestorTag, ancestorLocation)}`;
	}

	return null;
}

/** Return a diagnostic when `childTag` causes its direct parent to be repaired. */
export function invalidHtmlNestingWithParent(childTag, parentTag, childLocation, parentLocation) {
	if (childTag.includes('-') || parentTag.includes('-')) return null;
	if (parentTag === 'template') return null;

	const disallowed = disallowedChildren[parentTag];
	const child = elementLabel(childTag, childLocation);
	const parent = elementLabel(parentTag, parentLocation);

	if (disallowed) {
		if ('direct' in disallowed && disallowed.direct.includes(childTag)) {
			return `${child} cannot be a direct child of ${parent}`;
		}
		if ('descendant' in disallowed && disallowed.descendant.includes(childTag)) {
			return `${child} cannot be a child of ${parent}`;
		}
		if ('only' in disallowed && !disallowed.only.includes(childTag)) {
			const allowed = disallowed.only.map((tag) => `\`<${tag}>\``).join(', ');
			let message = `${child} cannot be a child of ${parent}`;
			if (allowed !== '') {
				message += `. \`<${parentTag}>\` only allows these children: ${allowed}`;
			}
			if (parentTag === 'table' && childTag === 'tr') {
				message +=
					'. Add a `<tbody>`, `<thead>`, or `<tfoot>` to match the DOM tree generated by the browser';
			}
			return message;
		}
		if ('only' in disallowed) return null;
	}

	switch (childTag) {
		case 'body':
		case 'caption':
		case 'col':
		case 'colgroup':
		case 'frameset':
		case 'frame':
		case 'head':
		case 'html':
			return `${child} cannot be a child of ${parent}`;
		case 'thead':
		case 'tbody':
		case 'tfoot':
			return `${child} must be the child of a \`<table>\`, not ${parent}`;
		case 'td':
		case 'th':
			return `${child} must be the child of a \`<tr>\`, not ${parent}`;
		case 'tr':
			return `${child} must be the child of a \`<thead>\`, \`<tbody>\`, or \`<tfoot>\`, not ${parent}`;
		default:
			return null;
	}
}

/** Return a diagnostic when visible or whitespace text cannot remain under its parent. */
export function invalidHtmlTextNesting(text, parentTag, parentLocation) {
	if (text === '') return null;
	if (
		parentTag !== 'table' &&
		parentTag !== 'tbody' &&
		parentTag !== 'thead' &&
		parentTag !== 'tfoot' &&
		parentTag !== 'tr' &&
		parentTag !== 'colgroup' &&
		parentTag !== 'head' &&
		parentTag !== 'html'
	) {
		return null;
	}
	const whitespace = !/\S/.test(text);
	return (
		(whitespace ? 'whitespace text nodes' : 'text nodes') +
		' cannot be a child of ' +
		elementLabel(parentTag, parentLocation) +
		(whitespace ? '. Make sure you do not have any extra whitespace between tags' : '')
	);
}
