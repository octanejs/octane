import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@octanejs/testing-library';
import { compile } from 'octane/compiler';
import { App, callout } from '@octane-eval-submission/octane.repair-shorthand-clash/src/App.tsrx';

const TASK_ID = 'octane.repair-shorthand-clash';
const SIDES = ['top', 'right', 'bottom', 'left'] as const;
const BORDER_STYLES = new Set([
	'none',
	'solid',
	'dashed',
	'dotted',
	'double',
	'groove',
	'ridge',
	'inset',
	'outset',
	'hidden',
]);
const BORDER_WIDTH =
	/^(?:thin|medium|thick|[-\d.]+(?:px|em|rem|pt|pc|in|cm|mm|q|ch|cap|ex|ic|lh|rlh|vw|vh|vi|vb|vmin|vmax))$/i;

afterEach(cleanup);

const taskRoot = dirname(fileURLToPath(import.meta.url));

function submissionSource(): string {
	const submissionRoot = process.env.OCTANE_EVAL_SUBMISSION_ROOT;
	return readFileSync(
		submissionRoot
			? resolve(submissionRoot, TASK_ID, 'src', 'App.tsrx')
			: join(taskRoot, 'reference', 'src', 'App.tsrx'),
		'utf8',
	);
}

function injectedSheets(): HTMLStyleElement[] {
	return Array.from(document.head.querySelectorAll<HTMLStyleElement>('style[data-octane]'));
}

interface Declaration {
	property: string;
	value: string;
	important: boolean;
}

interface StyleRule {
	selector: string;
	sheetHash: string;
	declarations: Declaration[];
	order: number;
}

// Flat `selector { decls }` parse: the sheets this task emits contain no
// at-rule blocks, so nested braces never appear inside a rule body.
function parseRules(css: string, sheetHash: string, orderBase: number): StyleRule[] {
	const rules: StyleRule[] = [];
	const cleaned = css.replace(/\/\*[\s\S]*?\*\//g, '');
	for (const match of cleaned.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
		const declarations: Declaration[] = [];
		for (const declaration of match[2].split(';')) {
			const separator = declaration.indexOf(':');
			if (separator === -1) continue;
			const property = declaration.slice(0, separator).trim().toLowerCase();
			let value = declaration.slice(separator + 1).trim();
			const important = /!\s*important\s*$/.test(value);
			if (important) value = value.replace(/!\s*important\s*$/, '').trim();
			if (property) declarations.push({ property, value, important });
		}
		rules.push({
			selector: match[1].trim(),
			sheetHash,
			declarations,
			order: orderBase + rules.length,
		});
	}
	return rules;
}

function rulesMatching(element: Element): StyleRule[] {
	const rules: StyleRule[] = [];
	for (const [sheetIndex, sheet] of injectedSheets().entries()) {
		const hash = sheet.getAttribute('data-octane') ?? '';
		for (const rule of parseRules(sheet.textContent ?? '', hash, sheetIndex * 10_000)) {
			let matched = false;
			try {
				matched = element.matches(rule.selector);
			} catch {
				matched = false;
			}
			if (matched) rules.push(rule);
		}
	}
	return rules;
}

// Crude specificity sufficient for this task's selectors: ids, then
// classes/attributes/pseudo-classes, then types. `:where()` args contribute
// nothing, matching the real cascade.
function specificity(selector: string): [number, number, number] {
	const stripped = selector.replace(/:where\([^)]*\)/g, '');
	const ids = (stripped.match(/#[\w-]+/g) ?? []).length;
	const classes = (stripped.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[a-z-]+(?:\([^)]*\))?/gi) ?? [])
		.length;
	const types = (stripped.match(/(^|[\s>+~])([a-z][\w-]*)/gi) ?? []).length;
	return [ids, classes, types];
}

function compareSpec(a: [number, number, number], b: [number, number, number]): number {
	for (let index = 0; index < 3; index++) if (a[index] !== b[index]) return a[index] - b[index];
	return 0;
}

function borderShorthandParts(value: string): { width?: string; style?: string; color?: string } {
	const parts: { width?: string; style?: string; color?: string } = {};
	for (const token of value.match(/[\w-]+\([^)]*\)|[^\s]+/g) ?? []) {
		if (BORDER_STYLES.has(token.toLowerCase())) parts.style ??= token.toLowerCase();
		else if (BORDER_WIDTH.test(token)) parts.width ??= token;
		else parts.color = token;
	}
	return parts;
}

/** The border-side slots a declaration writes, with CSS shorthand expansion. */
function declarationWrites(declaration: Declaration): Array<[string, string]> {
	const { property, value } = declaration;
	if (property === 'border' || /^border-(top|right|bottom|left)$/.test(property)) {
		const sides =
			property === 'border' ? [...SIDES] : [/^border-(\w+)$/.exec(property)![1] as string];
		const parts = borderShorthandParts(value);
		return sides.flatMap((side) => [
			[`border-${side}-width`, parts.width ?? 'medium'],
			[`border-${side}-style`, parts.style ?? 'none'],
			[`border-${side}-color`, parts.color ?? 'currentcolor'],
		]);
	}
	const boxGroup = /^border-(width|style|color)$/.exec(property);
	if (boxGroup) {
		const aspect = boxGroup[1];
		const [a, b = a, c = a, d = b] = value.trim().split(/\s+/);
		return [
			[`border-top-${aspect}`, a],
			[`border-right-${aspect}`, b],
			[`border-bottom-${aspect}`, c],
			[`border-left-${aspect}`, d],
		];
	}
	if (/^border-(top|right|bottom|left)-(width|style|color)$/.test(property)) {
		return [[property, value]];
	}
	return [];
}

interface Write {
	value: string;
	important: boolean;
	spec: [number, number, number];
	order: number;
}

/** Effective border-side values on an element: !important, then specificity, then order. */
function effectiveBorder(element: Element): Map<string, string> {
	const winners = new Map<string, Write>();
	for (const rule of rulesMatching(element)) {
		const spec = specificity(rule.selector);
		for (const declaration of rule.declarations) {
			for (const [slot, value] of declarationWrites(declaration)) {
				const write: Write = {
					value,
					important: declaration.important,
					spec,
					order: rule.order,
				};
				const winner = winners.get(slot);
				if (winner === undefined) {
					winners.set(slot, write);
					continue;
				}
				if (write.important !== winner.important) {
					if (write.important) winners.set(slot, write);
					continue;
				}
				const cmp = compareSpec(write.spec, winner.spec);
				if (cmp > 0 || (cmp === 0 && write.order >= winner.order)) winners.set(slot, write);
			}
		}
	}
	return new Map([...winners].map(([slot, write]) => [slot, write.value]));
}

describe('octane.repair-shorthand-clash', () => {
	it('compiles with no style diagnostics, as `octane analyze --strict` requires', () => {
		const source = submissionSource();
		expect(source.includes('octane-ignore')).toBe(false);
		const { diagnostics } = compile(source, `${TASK_ID}/src/App.tsrx`);
		expect(diagnostics ?? []).toEqual([]);
	});

	it('keeps the theme applied and the card markup intact', () => {
		const view = render(App);
		const board = view.container.querySelector('.board')!;
		const card = board.querySelector('.card')!;
		expect(card.tagName).toBe('ARTICLE');
		expect(card.querySelector('h2')!.textContent).toBe('Usage');
		for (const themeClass of String(callout.$class).split(' ')) {
			expect(card.classList.contains(themeClass)).toBe(true);
		}
		expect(card.getAttribute('style') ?? '').not.toContain('border');
	});

	it('renders the theme top border beside the scope side borders', () => {
		const view = render(App);
		const card = view.container.querySelector('.board .card')!;
		const border = effectiveBorder(card);
		expect(border.get('border-top-color')).toBe('#d93025');
		for (const side of ['right', 'bottom', 'left'] as const) {
			expect(border.get(`border-${side}-color`)).toBe('#3c4043');
		}
		for (const side of SIDES) {
			expect(border.get(`border-${side}-width`)).toBe('1px');
			expect(border.get(`border-${side}-style`)).toBe('solid');
		}
	});

	it('keeps the heading margin declaration', () => {
		const view = render(App);
		const heading = view.container.querySelector('.board .card h2')!;
		const margins = rulesMatching(heading)
			.flatMap((rule) => rule.declarations)
			.filter((declaration) => declaration.property === 'margin');
		expect(margins.at(-1)?.value).toBe('0');
	});

	it('does not restate the top border color inside the scope sheet', () => {
		render(App);
		const themeHashes = new Set(String(callout.$class).split(' '));
		const scopeSheets = injectedSheets().filter(
			(sheet) => !themeHashes.has(sheet.getAttribute('data-octane') ?? ''),
		);
		expect(scopeSheets.length).toBeGreaterThan(0);
		for (const sheet of scopeSheets) {
			for (const rule of parseRules(sheet.textContent ?? '', '', 0)) {
				if (!rule.selector.includes('.card')) continue;
				const restated = rule.declarations.some(
					(declaration) => declaration.property === 'border-top-color',
				);
				expect(restated, `scope rule "${rule.selector}" restates border-top-color`).toBe(false);
			}
		}
	});
});
