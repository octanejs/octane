// @vitest-environment node

/**
 * Every value in this suite is a wire contract: two or more modules compare it
 * byte-for-byte across a boundary neither side can observe from the other. The
 * client runtime and the SSR serializer agree on hydration marker payloads and
 * `useId` spelling; the pre-root capture bundle and the server agree on the
 * deferred-boundary attributes; the universal core, the React compat layers and
 * both runtimes agree on `Symbol.for` registry keys.
 *
 * Re-typing one of these in a second module compiles, passes every one-sided
 * format test, and then fails only as a hydration mismatch in a real app. So
 * each value gets exactly one owning module here, and the scan below fails if a
 * second module spells it again.
 *
 * Out of scope: `src/compiler/*` ships as verbatim JavaScript and cannot import
 * a `.ts` leaf, so `compile.js` still mints its own binding markers. Sharing
 * those needs a plain-JS leaf (the `dom-tables.js` pattern) and is not done.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
	formatUseId,
	HYDRATION_END,
	HYDRATION_FOR_ARM_INDEX,
	HYDRATION_FOR_EMPTY,
	HYDRATION_FOR_ITEMS,
	HYDRATION_FOR_PREFIX,
	HYDRATION_START,
	HYDRATE_ID_ATTR,
	HYDRATE_ID_COUNT_ATTR,
	HYDRATE_MARKER_SELECTOR,
	HYDRATE_SEED_ATTR,
	HYDRATE_WHEN_ATTR,
} from '../src/hydration-markers.js';
import { bindingRootMarker, BINDING_OPEN_PREFIX } from '../src/dom-binding-protocol.js';
import { VIEW_TRANSITION_SCOPE_CSS, VIEW_TRANSITION_SCOPE_STYLE_ID } from '../src/css.js';
import * as tags from '../src/runtime-tags.js';

const srcRoot = resolve(import.meta.dirname, '../src');

function sourceFiles(): string[] {
	const out: string[] = [];
	(function walk(dir: string): void {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const full = join(dir, entry.name);
			// The compiler ships as verbatim JS and cannot import these leaves.
			if (entry.isDirectory()) {
				if (entry.name !== 'compiler') walk(full);
			} else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
				out.push(full);
			}
		}
	})(srcRoot);
	return out;
}

function stringSpellings(source: string) {
	const literals = new Set<string>();
	const fragments: string[] = [];
	const file = ts.createSourceFile('protocol.ts', source, ts.ScriptTarget.Latest);
	function visit(node: ts.Node): void {
		if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
			literals.add(node.text);
		} else if (ts.isTemplateExpression(node)) {
			fragments.push(node.head.text, ...node.templateSpans.map((span) => span.literal.text));
		}
		ts.forEachChild(node, visit);
	}
	visit(file);
	return { literals, fragments };
}

const SOURCES = sourceFiles().map((file) => ({
	name: relative(srcRoot, file),
	...stringSpellings(readFileSync(file, 'utf8')),
}));

/** Quoted values and interpolated template fragments count; comments do not. */
function spelledIn(literal: string, sources = SOURCES): string[] {
	return sources
		.filter(
			({ literals, fragments }) =>
				literals.has(literal) || fragments.some((fragment) => fragment.includes(literal)),
		)
		.map(({ name }) => name);
}

describe('hydration marker payloads', () => {
	it('keeps the exact wire spelling both runtimes compare', () => {
		expect(HYDRATION_START).toBe('[');
		expect(HYDRATION_END).toBe(']');
		expect(HYDRATION_FOR_PREFIX).toBe('[f');
		expect(HYDRATION_FOR_EMPTY).toBe('[f0');
		expect(HYDRATION_FOR_ITEMS).toBe('[f1');
		// Both arms carry their digit at the same offset; the runtime reads it
		// positionally to tell an @empty range from an items range.
		expect(HYDRATION_FOR_ARM_INDEX).toBe(2);
		expect(HYDRATION_FOR_EMPTY[HYDRATION_FOR_ARM_INDEX]).toBe('0');
		expect(HYDRATION_FOR_ITEMS[HYDRATION_FOR_ARM_INDEX]).toBe('1');
	});

	it('spells each arm marker in exactly one module', () => {
		// The payloads stay plain literals: a cross-module template-literal
		// derivation is not constant-folded by the bundler and measurably grew
		// every entry bundle. Downstream prefixes still derive from them.
		expect(spelledIn('[f')).toEqual(['hydration-markers.ts']);
		expect(spelledIn('[f0')).toEqual(['hydration-markers.ts']);
		expect(spelledIn('[f1')).toEqual(['hydration-markers.ts']);
		expect(spelledIn('[f0;b;')).toEqual([]);
		expect(spelledIn('[f1;b;')).toEqual([]);
	});
});

describe('presentation binding markers', () => {
	it.each([
		['a template head', 'const marker = `[b;${id};root`;'],
		['a template middle', 'const marker = `${before}<!--[b;${id};root`;'],
		['a template tail', 'const marker = `${prefix}[b;`;'],
		['an escaped template fragment', 'const marker = `\\u005bb;${id};root`;'],
		['a quoted value', "const marker = '[b;';"],
	])('rejects a second spelling in %s', (_name, source) => {
		const sources = [{ name: 'another-owner.ts', ...stringSpellings(source) }];
		expect(spelledIn('[b;', sources)).toEqual(['another-owner.ts']);
	});

	it('ignores prose and unrelated quoted values', () => {
		const source = '// const marker = `[b;${id};root`;\n/* "[b;" */\nconst value = "[function]";';
		const sources = [{ name: 'another-owner.ts', ...stringSpellings(source) }];
		expect(spelledIn('[b;', sources)).toEqual([]);
		expect(spelledIn('[f', sources)).toEqual([]);
	});

	it('keeps the exact wire spelling the SSR serializer stamps', () => {
		expect(BINDING_OPEN_PREFIX).toBe('[b;');
		expect(bindingRootMarker('v7')).toBe('[b;v7;root');
	});

	it('is derived, so no module can spell the open prefix again', () => {
		expect(spelledIn('[b;')).toEqual([]);
	});
});

describe('deferred hydration boundary attributes', () => {
	it('keeps the exact attribute names the server writes', () => {
		expect(HYDRATE_ID_ATTR).toBe('data-octane-hydrate-id');
		expect(HYDRATE_WHEN_ATTR).toBe('data-octane-hydrate-when');
		expect(HYDRATE_ID_COUNT_ATTR).toBe('data-octane-hydrate-id-count');
		expect(HYDRATE_SEED_ATTR).toBe('data-octane-hydrate-seed');
		expect(HYDRATE_MARKER_SELECTOR).toBe('[data-octane-hydrate-id]');
	});

	it('names each attribute in exactly one module', () => {
		expect(spelledIn('data-octane-hydrate-id')).toEqual(['hydration-markers.ts']);
		expect(spelledIn('data-octane-hydrate-when')).toEqual(['hydration-markers.ts']);
		expect(spelledIn('data-octane-hydrate-id-count')).toEqual(['hydration-markers.ts']);
		expect(spelledIn('data-octane-hydrate-seed')).toEqual(['hydration-markers.ts']);
		expect(spelledIn('[data-octane-hydrate-id]')).toEqual(['hydration-markers.ts']);
	});
});

describe('useId wire format', () => {
	it('keeps the exact spelling the client regenerates after SSR', () => {
		expect(formatUseId('', 0)).toBe(':in-0:');
		expect(formatUseId('r3-', 0)).toBe(':r3-in-0:');
		// Base-36 ordinals: the server counts and the client must land on the
		// same string for the same slot.
		expect(formatUseId('r3-', 35)).toBe(':r3-in-z:');
		expect(formatUseId('r3-', 36)).toBe(':r3-in-10:');
	});

	it('spells the infix in exactly one module', () => {
		expect(spelledIn('in-')).toEqual(['hydration-markers.ts']);
	});
});

describe('element-scoped view transition stylesheet', () => {
	it('keeps one identity and one body for client and SSR', () => {
		expect(VIEW_TRANSITION_SCOPE_STYLE_ID).toBe('octane-view-transition-scope');
		expect(VIEW_TRANSITION_SCOPE_CSS).toBe(
			'[vt-scope="element"]{view-transition-scope:all!important}',
		);
	});

	it('spells each half in exactly one module', () => {
		expect(spelledIn('octane-view-transition-scope')).toEqual(['css.ts']);
		expect(spelledIn('[vt-scope="element"]{view-transition-scope:all!important}')).toEqual([
			'css.ts',
		]);
	});
});

describe('cross-realm Symbol.for registry keys', () => {
	const KEYS: Readonly<Record<string, symbol>> = {
		'octane.element': tags.ELEMENT_TAG,
		'octane.portal': tags.PORTAL_TAG,
		'octane.Fragment': tags.FRAGMENT_TAG,
		'octane.Activity': tags.ACTIVITY_TAG,
		'octane.context': tags.CONTEXT_TAG,
		'octane.lazy': tags.LAZY_COMPONENT_TAG,
		'octane.suspense': tags.SUSPENSE_TAG,
		'octane.childrenBlock': tags.CHILDREN_BLOCK_TAG,
		'octane.renderer-region.owner': tags.RENDERER_REGION_OWNER_TAG,
		'react.context': tags.REACT_CONTEXT_TAG,
	};

	it('resolves each tag from the global registry key it documents', () => {
		for (const [key, tag] of Object.entries(KEYS)) {
			expect(tag).toBe(Symbol.for(key));
		}
	});

	it('spells each key in exactly one module', () => {
		for (const key of Object.keys(KEYS)) {
			expect({ key, spelledIn: spelledIn(key) }).toEqual({
				key,
				spelledIn: ['runtime-tags.ts'],
			});
		}
	});
});
