import {
	generate,
	List,
	parse,
	walk,
	type Atrule,
	type CssNode,
	type Declaration,
	type Dimension,
	type FunctionNode,
	type NumberNode,
	type Percentage,
	type Rule,
} from 'css-tree';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { compile } from 'tailwindcss';
import { collectTailwindBoundaries, type TailwindBoundaryOptions } from './context.ts';

const require = createRequire(import.meta.url);
const TAILWIND_STYLESHEETS = new Set(['tailwindcss/theme.css', 'tailwindcss/utilities.css']);

interface CompiledStyles {
	inline: Map<string, string>;
	nonInline: string;
}

export async function renderWithTailwind(render: () => string | Promise<string>): Promise<string> {
	const { value: html, boundaries } = await collectTailwindBoundaries(render);
	return transformTailwindHtml(html, boundaries);
}

export async function transformTailwindHtml(
	html: string,
	boundaries: ReadonlyMap<string, TailwindBoundaryOptions>,
): Promise<string> {
	let output = html;
	for (const [id, options] of boundaries) {
		const escapedId = escapeRegExp(id);
		const boundaryPattern = new RegExp(
			`<template[^>]*data-octane-email-tailwind-start=["']${escapedId}["'][^>]*><\\/template>([\\s\\S]*?)<template[^>]*data-octane-email-tailwind-end=["']${escapedId}["'][^>]*><\\/template>`,
		);
		const match = boundaryPattern.exec(output);
		if (!match) continue;
		const fragment = match[1];
		if (fragment.includes('data-octane-email-tailwind-start')) {
			throw new Error('Tailwind boundaries cannot be nested. Use a single Tailwind configuration.');
		}
		const classes = collectClasses(fragment);
		const styles = await compileStyles(classes, options);
		const transformed = inlineFragment(fragment, styles.inline);
		output = output.replace(boundaryPattern, () => transformed);
		if (styles.nonInline) output = injectHeadStyle(output, styles.nonInline);
	}
	return output;
}

async function compileStyles(
	classes: string[],
	options: TailwindBoundaryOptions,
): Promise<CompiledStyles> {
	if (classes.length === 0) return { inline: new Map(), nonInline: '' };
	const css = `@layer theme, utilities;
@import "tailwindcss/theme.css";
@import "tailwindcss/utilities.css";
${options.theme ?? ''}
${options.utility ?? ''}
@config;`;
	const compiler = await compile(css, {
		polyfills: 0,
		async loadStylesheet(id) {
			if (!TAILWIND_STYLESHEETS.has(id)) {
				throw new Error(`Unsupported Tailwind stylesheet: ${id}`);
			}
			const path = require.resolve(id);
			return { path, base: dirname(path), content: await readFile(path, 'utf8') };
		},
		async loadModule(id, base, resourceHint) {
			if (resourceHint === 'config') return { path: id, base, module: options.config ?? {} };
			throw new Error(`Unsupported Tailwind module: ${id}`);
		},
	});
	const ast = parse(compiler.build(classes), { context: 'stylesheet' });
	const inline = new Map<string, string>();
	const customProperties = new Map<string, string>();
	const nonInlineNodes: Array<Rule | Atrule> = [];
	walk(ast, {
		visit: 'Rule',
		enter(node, item, list) {
			const rule = node as Rule;
			const selector = generate(rule.prelude);
			const parent = this.atrule;
			if (!parent && (selector === ':root' || selector === ':root,:host')) {
				walk(rule.block, {
					visit: 'Declaration',
					enter(declaration) {
						const value = declaration as Declaration;
						if (value.property.startsWith('--'))
							customProperties.set(value.property, generate(value.value));
					},
				});
				list?.remove(item);
				return;
			}
			const className = selectorToClass(selector);
			if (!className || parent || selector.includes(':')) return;
			let declarations = '';
			walk(rule.block, {
				visit: 'Declaration',
				enter(declaration) {
					const value = declaration as Declaration;
					if (!value.property.startsWith('--')) {
						const important = value.important ? ' !important' : '';
						const resolvedValue = resolveCssVariables(generate(value.value), customProperties);
						declarations += `${value.property}:${sanitizeOklchColors(resolvedValue, 'value')}${important};`;
					}
				},
			});
			if (declarations) inline.set(className, declarations);
			list?.remove(item);
		},
	});
	// What remains is media/pseudo CSS plus Tailwind's supporting at-rules.
	if (ast.type !== 'StyleSheet') throw new Error('Tailwind generated an invalid stylesheet.');
	for (const node of ast.children) nonInlineNodes.push(node as Rule | Atrule);
	const nonInline =
		nonInlineNodes.length > 0
			? sanitizeOklchColors(resolveCssVariables(generate(ast), customProperties), 'stylesheet')
			: '';
	return { inline, nonInline };
}

function collectClasses(html: string): string[] {
	const classes = new Set<string>();
	mapStartTags(html, (tag) => {
		const attribute = findQuotedAttribute(tag, 'class');
		if (attribute) {
			for (const name of attribute.value.trim().split(/\s+/)) if (name) classes.add(name);
		}
		return tag;
	});
	return [...classes];
}

function inlineFragment(html: string, styles: ReadonlyMap<string, string>): string {
	return mapStartTags(html, (tag) => {
		const classAttribute = findQuotedAttribute(tag, 'class');
		if (!classAttribute) return tag;
		const generated = classAttribute.value
			.split(/\s+/)
			.map((name) => styles.get(name) ?? '')
			.join('');
		if (!generated) return tag;

		const styleAttribute = findQuotedAttribute(tag, 'style');
		if (styleAttribute) {
			const escapedGenerated = escapeAttributeFragment(generated, styleAttribute.quote);
			return `${tag.slice(0, styleAttribute.valueStart)}${escapedGenerated}${styleAttribute.value}${tag.slice(styleAttribute.valueEnd)}`;
		}

		const escapedGenerated = escapeAttributeFragment(generated, '"');
		const selfClosing = /\/\s*>$/.exec(tag);
		const insertionPoint = selfClosing?.index ?? tag.lastIndexOf('>');
		const prefix = tag.slice(0, insertionPoint);
		const separator = /\s$/.test(prefix) ? '' : ' ';
		return `${prefix}${separator}style="${escapedGenerated}"${tag.slice(insertionPoint)}`;
	});
}

interface QuotedAttribute {
	quote: '"' | "'";
	value: string;
	valueStart: number;
	valueEnd: number;
}

function findQuotedAttribute(tag: string, expectedName: string): QuotedAttribute | undefined {
	const tagName = /^<[a-z][^\s/>]*/i.exec(tag);
	if (!tagName) return;
	let cursor = tagName[0].length;
	while (cursor < tag.length) {
		while (/\s/.test(tag[cursor] ?? '')) cursor++;
		if (tag[cursor] === '>' || (tag[cursor] === '/' && /^\/\s*>/.test(tag.slice(cursor)))) return;

		const nameStart = cursor;
		while (cursor < tag.length && !/[\s=/>]/.test(tag[cursor])) cursor++;
		if (cursor === nameStart) {
			cursor++;
			continue;
		}
		const name = tag.slice(nameStart, cursor);
		while (/\s/.test(tag[cursor] ?? '')) cursor++;
		if (tag[cursor] !== '=') continue;
		cursor++;
		while (/\s/.test(tag[cursor] ?? '')) cursor++;
		const quote = tag[cursor];
		if (quote !== '"' && quote !== "'") {
			while (cursor < tag.length && !/[\s>]/.test(tag[cursor])) cursor++;
			continue;
		}

		const valueStart = ++cursor;
		while (cursor < tag.length && tag[cursor] !== quote) cursor++;
		if (cursor === tag.length) return;
		const valueEnd = cursor;
		cursor++;
		if (name.toLowerCase() === expectedName) {
			return {
				quote,
				value: tag.slice(valueStart, valueEnd),
				valueStart,
				valueEnd,
			};
		}
	}
}

function mapStartTags(html: string, transform: (tag: string) => string): string {
	let output = '';
	let copiedThrough = 0;
	let cursor = 0;
	while (cursor < html.length) {
		const tagStart = html.indexOf('<', cursor);
		if (tagStart === -1) break;
		if (!/[a-z]/i.test(html[tagStart + 1] ?? '')) {
			cursor = tagStart + 1;
			continue;
		}

		let tagEnd = tagStart + 2;
		let quote: '"' | "'" | undefined;
		for (; tagEnd < html.length; tagEnd++) {
			const character = html[tagEnd];
			if (quote) {
				if (character === quote) quote = undefined;
			} else if (character === '"' || character === "'") {
				quote = character;
			} else if (character === '>') {
				break;
			}
		}
		if (tagEnd === html.length) break;

		output += html.slice(copiedThrough, tagStart);
		output += transform(html.slice(tagStart, tagEnd + 1));
		copiedThrough = tagEnd + 1;
		cursor = copiedThrough;
	}
	return output + html.slice(copiedThrough);
}

function escapeAttributeFragment(value: string, quote: '"' | "'"): string {
	return value.replaceAll('&', '&amp;').replaceAll(quote, quote === '"' ? '&quot;' : '&#39;');
}

function injectHeadStyle(html: string, css: string): string {
	const style = `<style>${css}</style>`;
	if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, () => `${style}</head>`);
	throw new Error('Tailwind: <head> not found. Move <Head /> inside <Tailwind>.');
}

function selectorToClass(selector: string): string | undefined {
	const match = /^\.((?:\\.|[\w-!])+)$/.exec(selector);
	return match?.[1].replace(/\\(.)/g, '$1');
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveCssVariables(value: string, variables: ReadonlyMap<string, string>): string {
	let resolved = value;
	for (let pass = 0; pass < 8 && /var\(/i.test(resolved); pass++) {
		const next = replaceCssVariables(resolved, variables);
		if (next === resolved) break;
		resolved = next;
	}
	return resolved;
}

function replaceCssVariables(value: string, variables: ReadonlyMap<string, string>): string {
	let output = '';
	let copiedThrough = 0;
	let cursor = 0;

	while (cursor < value.length) {
		const character = value[cursor];
		if (character === '"' || character === "'") {
			cursor = skipCssString(value, cursor, character);
			continue;
		}
		if (character === '/' && value[cursor + 1] === '*') {
			cursor = skipCssComment(value, cursor);
			continue;
		}

		const previous = value[cursor - 1];
		if (
			value.slice(cursor, cursor + 4).toLowerCase() !== 'var(' ||
			(previous !== undefined && /[\w-]/.test(previous))
		) {
			cursor++;
			continue;
		}

		const closingParenthesis = findClosingParenthesis(value, cursor + 3);
		if (closingParenthesis === -1) break;

		const argumentsText = value.slice(cursor + 4, closingParenthesis);
		const comma = findTopLevelComma(argumentsText);
		const name = argumentsText.slice(0, comma === -1 ? undefined : comma).trim();
		if (!/^--[\w-]+$/.test(name)) {
			cursor = closingParenthesis + 1;
			continue;
		}

		const fallback = comma === -1 ? undefined : argumentsText.slice(comma + 1).trim();
		const replacement = variables.get(name) ?? fallback;
		if (replacement === undefined) {
			cursor = closingParenthesis + 1;
			continue;
		}

		output += value.slice(copiedThrough, cursor) + replacement;
		cursor = closingParenthesis + 1;
		copiedThrough = cursor;
	}

	return output + value.slice(copiedThrough);
}

function findClosingParenthesis(value: string, openingParenthesis: number): number {
	let depth = 1;
	let cursor = openingParenthesis + 1;
	while (cursor < value.length) {
		const character = value[cursor];
		if (character === '"' || character === "'") {
			cursor = skipCssString(value, cursor, character);
			continue;
		}
		if (character === '/' && value[cursor + 1] === '*') {
			cursor = skipCssComment(value, cursor);
			continue;
		}
		if (character === '(') depth++;
		else if (character === ')' && --depth === 0) return cursor;
		cursor++;
	}
	return -1;
}

function findTopLevelComma(value: string): number {
	let depth = 0;
	let cursor = 0;
	while (cursor < value.length) {
		const character = value[cursor];
		if (character === '"' || character === "'") {
			cursor = skipCssString(value, cursor, character);
			continue;
		}
		if (character === '/' && value[cursor + 1] === '*') {
			cursor = skipCssComment(value, cursor);
			continue;
		}
		if (character === '(') depth++;
		else if (character === ')') depth--;
		else if (character === ',' && depth === 0) return cursor;
		cursor++;
	}
	return -1;
}

function skipCssString(value: string, start: number, quote: '"' | "'"): number {
	let cursor = start + 1;
	while (cursor < value.length) {
		if (value[cursor] === '\\') cursor += 2;
		else if (value[cursor++] === quote) break;
	}
	return cursor;
}

function skipCssComment(value: string, start: number): number {
	const end = value.indexOf('*/', start + 2);
	return end === -1 ? value.length : end + 2;
}

const OKLAB_TO_LMS = {
	l: [0.3963377773761749, 0.2158037573099136],
	m: [-0.1055613458156586, -0.0638541728258133],
	s: [-0.0894841775298119, -1.2914855480194092],
} as const;

const LMS_TO_RGB = {
	r: [4.076741636075958, -3.307711539258063, 0.2309699031821043],
	g: [-1.2684379732850315, 2.609757349287688, -0.341319376002657],
	b: [-0.0041960761386756, -0.7034186179359362, 1.7076146940746117],
} as const;

function sanitizeOklchColors(value: string, context: 'stylesheet' | 'value'): string {
	if (!/oklch\(/i.test(value)) return value;
	const ast = parse(value, { context });
	walk(ast, {
		visit: 'Function',
		enter(node, item) {
			const color = node as FunctionNode;
			if (color.name.toLowerCase() !== 'oklch') return;
			item.data = oklchToRgbNode(color);
		},
	});
	return generate(ast);
}

function oklchToRgbNode(color: FunctionNode): FunctionNode {
	let lightness: number | undefined;
	let chroma: number | undefined;
	let hue: number | undefined;
	let alpha: number | undefined;

	for (const child of color.children) {
		if (child.type === 'Number') {
			const value = Number.parseFloat((child as NumberNode).value);
			if (lightness === undefined) lightness = value;
			else if (chroma === undefined) chroma = value;
			else if (hue === undefined) hue = value;
			else if (alpha === undefined) alpha = value;
		} else if (child.type === 'Dimension') {
			const value = child as Dimension;
			if (hue === undefined && value.unit.toLowerCase() === 'deg') {
				hue = Number.parseFloat(value.value);
			}
		} else if (child.type === 'Percentage') {
			const value = Number.parseFloat((child as Percentage).value) / 100;
			if (lightness === undefined) lightness = value;
			else if (alpha === undefined) alpha = value;
		}
	}

	if (lightness === undefined || chroma === undefined || hue === undefined) {
		throw new Error(`Could not convert unsupported color ${generate(color)} to rgb().`);
	}

	const hueRadians = (hue / 180) * Math.PI;
	const a = chroma * Math.cos(hueRadians);
	const b = chroma * Math.sin(hueRadians);
	const l = (lightness + OKLAB_TO_LMS.l[0] * a + OKLAB_TO_LMS.l[1] * b) ** 3;
	const m = (lightness + OKLAB_TO_LMS.m[0] * a + OKLAB_TO_LMS.m[1] * b) ** 3;
	const s = (lightness + OKLAB_TO_LMS.s[0] * a + OKLAB_TO_LMS.s[1] * b) ** 3;
	const red = clampRgb(
		255 * linearRgbToRgb(LMS_TO_RGB.r[0] * l + LMS_TO_RGB.r[1] * m + LMS_TO_RGB.r[2] * s),
	);
	const green = clampRgb(
		255 * linearRgbToRgb(LMS_TO_RGB.g[0] * l + LMS_TO_RGB.g[1] * m + LMS_TO_RGB.g[2] * s),
	);
	const blue = clampRgb(
		255 * linearRgbToRgb(LMS_TO_RGB.b[0] * l + LMS_TO_RGB.b[1] * m + LMS_TO_RGB.b[2] * s),
	);
	const children: CssNode[] = [
		rgbNumber(red),
		rgbComma(),
		rgbNumber(green),
		rgbComma(),
		rgbNumber(blue),
	];
	if (alpha !== undefined && alpha !== 1) children.push(rgbComma(), rgbNumber(alpha, false));
	return { type: 'Function', name: 'rgb', children: new List<CssNode>().fromArray(children) };
}

function linearRgbToRgb(value: number): number {
	const absolute = Math.abs(value);
	const sign = value < 0 ? -1 : 1;
	return absolute > 0.0031308 ? sign * (absolute ** (1 / 2.4) * 1.055 - 0.055) : value * 12.92;
}

function clampRgb(value: number): number {
	return Math.min(Math.max(value, 0), 255);
}

function rgbNumber(value: number, round = true): NumberNode {
	return { type: 'Number', value: round ? value.toFixed(0) : value.toString() };
}

function rgbComma(): CssNode {
	return { type: 'Operator', value: ',' };
}
