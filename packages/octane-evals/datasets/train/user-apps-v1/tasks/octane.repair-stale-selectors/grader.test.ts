import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@octanejs/testing-library';
import { compile } from 'octane/compiler';
import { App } from '@octane-eval-submission/octane.repair-stale-selectors/src/App.tsrx';

const TASK_ID = 'octane.repair-stale-selectors';

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

function scopeClasses(element: Element): string[] {
	const hashes = injectedSheets().map((sheet) => sheet.getAttribute('data-octane')!);
	return Array.from(element.classList).filter((name) => hashes.includes(name));
}

interface StyleRule {
	selector: string;
	declarations: Map<string, { value: string; important: boolean }>;
	order: number;
}

// Flat `selector { decls }` parse: the sheets these tasks emit contain no
// at-rule blocks, so nested braces never appear inside a rule body.
function parseRules(css: string, orderBase: number): StyleRule[] {
	const rules: StyleRule[] = [];
	const cleaned = css.replace(/\/\*[\s\S]*?\*\//g, '');
	for (const match of cleaned.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
		const declarations = new Map<string, { value: string; important: boolean }>();
		for (const declaration of match[2].split(';')) {
			const separator = declaration.indexOf(':');
			if (separator === -1) continue;
			const property = declaration.slice(0, separator).trim();
			let value = declaration.slice(separator + 1).trim();
			const important = /!important\s*$/.test(value);
			if (important) value = value.replace(/!important\s*$/, '').trim();
			if (property) declarations.set(property, { value, important });
		}
		rules.push({ selector: match[1].trim(), declarations, order: orderBase + rules.length });
	}
	return rules;
}

function rulesMatching(element: Element): StyleRule[] {
	const rules: StyleRule[] = [];
	let order = 0;
	for (const sheet of injectedSheets()) {
		for (const rule of parseRules(sheet.textContent ?? '', order)) {
			let matched = false;
			try {
				matched = element.matches(rule.selector);
			} catch {
				matched = false;
			}
			if (matched) rules.push(rule);
		}
		order += 10_000;
	}
	return rules;
}

function effectiveDeclaration(element: Element, property: string): string | undefined {
	let winner: { value: string; important: boolean; order: number } | undefined;
	for (const rule of rulesMatching(element)) {
		const declaration = rule.declarations.get(property);
		if (declaration === undefined) continue;
		if (
			winner === undefined ||
			(declaration.important && !winner.important) ||
			(declaration.important === winner.important && rule.order >= winner.order)
		) {
			winner = { ...declaration, order: rule.order };
		}
	}
	return winner?.value;
}

describe('octane.repair-stale-selectors', () => {
	it('compiles with no style diagnostics, as `octane analyze --strict` requires', () => {
		const source = submissionSource();
		expect(source.includes('octane-ignore')).toBe(false);
		const { diagnostics } = compile(source, `${TASK_ID}/src/App.tsrx`);
		expect(diagnostics ?? []).toEqual([]);
	});

	it('keeps the panel markup without reverted `.toolbar` or `.close` elements', () => {
		const view = render(App);
		const panel = view.container.querySelector('.panel')!;
		expect(panel.tagName).toBe('SECTION');
		expect(panel.querySelector('.title')!.textContent).toBe('Settings');
		const actions = panel.querySelector('.actions')!;
		expect(actions.tagName).toBe('DIV');
		const buttons = actions.querySelectorAll('button');
		expect(Array.from(buttons).map((button) => button.textContent)).toEqual(['Save', 'Cancel']);
		expect(actions.querySelector('.hint')!.textContent).toBe('Changes apply instantly');
		expect(view.container.querySelector('.toolbar')).toBeNull();
		expect(view.container.querySelector('.close')).toBeNull();
	});

	it('restores the row layout and hint placement through the scoped sheet', () => {
		const view = render(App);
		const panel = view.container.querySelector('.panel')!;
		const actions = panel.querySelector('.actions')!;
		const hint = actions.querySelector('.hint')!;

		expect(
			scopeClasses(actions).length,
			'expected the actions row to carry a scope hash class',
		).toBeGreaterThan(0);
		expect(effectiveDeclaration(actions, 'display')).toBe('flex');
		expect(effectiveDeclaration(actions, 'gap')).toBe('8px');
		expect(effectiveDeclaration(hint, 'margin-left')).toBe('auto');
		expect(effectiveDeclaration(panel.querySelector('.title')!, 'font-weight')).toBe('600');
	});

	it('ships no stale selectors or unused remnants in the emitted sheet', () => {
		render(App);
		const css = injectedSheets()
			.map((sheet) => sheet.textContent ?? '')
			.join('\n');
		expect(css).not.toContain('(unused)');
		const selectors = parseRules(css, 0).map((rule) => rule.selector);
		for (const selector of selectors) {
			expect(selector).not.toMatch(/\.(toolbar|close)(?![\w-])/);
		}
	});

	it('keeps styles in the stylesheet rather than inline props', () => {
		const view = render(App);
		const panel = view.container.querySelector('.panel')!;
		for (const element of panel.querySelectorAll('.title, .actions, .hint')) {
			expect(element.getAttribute('style')).toBeNull();
		}
	});
});
