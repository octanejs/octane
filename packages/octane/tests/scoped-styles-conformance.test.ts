/**
 * Scoped-style conformance fixtures (RFC tsrx-org/RFCs#1) compiled through
 * Octane's compiler. The fixtures and their `expected.json` contracts are
 * shared with the tsrx repository and come from the linked `@tsrx/core` test
 * harness; the schema is described in the README next to them
 * (`SCOPED_STYLES_FIXTURES_DIR/README.md`). Every `.tsrx` compiles on its own
 * in both `client` and `server` mode (imports unresolved) and the compiled
 * code is checked for:
 *
 * - `cssOrder`: marker rules `.<label>.<hash>` in `injectStyle` order, and one
 *   injection per scope hash;
 * - `elements`: every authored class value rendered with its scope chain
 *   (outer → inner) followed by applied themes;
 * - `classMaps`: `$class` composition of assigned blocks and their own entry;
 * - `pruned`: `(unused)` comments — Octane intentionally keeps every selector
 *   of a standalone block, so only assigned-block pruning is asserted.
 *
 * Where the shared module loader can evaluate the module (no export lists,
 * imports satisfiable with stubs) the client module is mounted and the
 * server module rendered, and the DOM / HTML class lists and SSR CSS are
 * checked against the same contract. Known discrepancies are pinned with
 * `it.fails` in `KNOWN_FAILURES` so they surface once fixed.
 */

import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';
import * as ServerRT from 'octane/server';
import {
	load_scoped_styles_fixtures,
	SCOPED_STYLES_FIXTURES_DIR,
} from '@tsrx/core/test-harness/scoped-styles-fixtures';
import { mount } from './_helpers';
import { loadCompiledFixtureSource } from './_server-fixture.js';

type Mode = 'client' | 'server';
const MODES: Mode[] = ['client', 'server'];
const HASH = 'tsrx-[0-9a-f]+';
const STRING = '"(?:[^"\\\\]|\\\\.)*"';
const RUNTIME_PREFIX = 'import:';

interface Expected {
	elements: Record<string, string[]>;
	cssOrder: string[];
	pruned: string[];
	classMaps: Record<string, string[]>;
	knownFailure?: string;
}

interface Fixture {
	name: string;
	path: string;
	source: string;
	expected: Expected;
}

const fixtures = load_scoped_styles_fixtures() as Fixture[];

/**
 * Fixtures whose compiled output currently disagrees with the contract, per
 * mode. When the mode's compilation throws, every check of that mode runs
 * under `it.fails`; otherwise only the sheet test (`cssOrder` + pruning) does.
 * Note the observed output; remove the entry once the compiler agrees.
 * Empty at the time of writing: the nested-scope client corruption (an origin
 * stamp landing on the parser-owned StyleSheet) and the missing server
 * injection for component-less theme modules (now `_$styleMap`) were fixed
 * while this suite was written.
 */
const KNOWN_FAILURES: Record<string, Partial<Record<Mode, string>>> = {};

// --- label / hash helpers -----------------------------------------------------

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isRuntime(label: string): boolean {
	return label.startsWith(RUNTIME_PREFIX);
}

function runtimeExpression(label: string): string {
	return label.slice(RUNTIME_PREFIX.length);
}

/** Every static label a fixture refers to. */
function collectLabels(expected: Expected): Set<string> {
	const labels = new Set(expected.cssOrder);
	for (const chain of Object.values(expected.elements)) {
		for (const label of chain) if (!isRuntime(label)) labels.add(label);
	}
	for (const [name, chain] of Object.entries(expected.classMaps)) {
		for (const label of chain) {
			if (isRuntime(label)) continue;
			labels.add(label === 'own' ? name : label);
		}
	}
	return labels;
}

/** Resolve each label to the hash of its marker selector `.label.<hash>`. */
function resolveLabels(css: string, labels: Set<string>): Map<string, string> {
	const hashes = new Map<string, string>();
	for (const label of labels) {
		const matches = [...css.matchAll(new RegExp(`\\.${escapeRegExp(label)}\\.(${HASH})`, 'g'))];
		if (matches.length === 0) {
			throw new Error(`no scoped marker selector for label "${label}" in:\n${css}`);
		}
		const [first] = matches;
		for (const match of matches) expect(match[1]).toBe(first[1]);
		hashes.set(label, first[1]);
	}
	return hashes;
}

function hashOf(label: string, hashes: Map<string, string>): string {
	const hash = hashes.get(label);
	if (!hash) throw new Error(`label "${label}" was not resolved`);
	return hash;
}

/** Labels of the marker rules in the CSS, in emission order. */
function emittedMarkers(css: string, labels: Set<string>): string[] {
	return [...css.matchAll(new RegExp(`\\.([A-Za-z_][\\w-]*)\\.${HASH}`, 'g'))]
		.map((match) => match[1])
		.filter((label) => labels.has(label));
}

/** Selector texts of every `(unused)` comment, in order. */
function prunedSelectors(css: string): string[] {
	return [...css.matchAll(/\/\* \(unused\) ([\s\S]*?)\*\//g)].map((match) =>
		match[1].split('{')[0].trim(),
	);
}

// --- compiled-code readers ------------------------------------------------------

interface Compiled {
	code: string;
	error?: Error;
}

/** Compile one mode; a throw is kept so the mode's checks can report it. */
function tryCompile(fixture: Fixture, mode: Mode): Compiled {
	try {
		return { code: compile(fixture.source, fixture.path, { mode }).code };
	} catch (error) {
		return { code: '', error: error as Error };
	}
}

interface Injection {
	hash: string;
	css: string;
}

/**
 * Every sheet the code injects, in source order: `_$injectStyle(hash, css)`
 * calls, and on the server also `_$styleMap(hash, css, map, applied)` — the
 * lazily injecting wrapper an assigned block compiles to there, which sits at
 * the declaration position.
 */
function injections(code: string): Injection[] {
	return [
		...code.matchAll(
			new RegExp(`\\b(?:injectStyle|styleMap)\\(\\s*(${STRING}),\\s*(${STRING})\\s*[,)]`, 'g'),
		),
	].map((match) => ({ hash: JSON.parse(match[1]), css: JSON.parse(match[2]) }));
}

/**
 * The injections deduplicated by hash in first-appearance order. On the
 * client every sheet is injected once at module level; on the server the
 * module-level sheets are re-injected inside every component function, so
 * the same hash may recur — each occurrence must carry identical CSS.
 */
function distinctInjections(code: string, mode: Mode): Injection[] {
	const all = injections(code);
	const seen = new Map<string, string>();
	const distinct: Injection[] = [];
	for (const injection of all) {
		const previous = seen.get(injection.hash);
		if (previous === undefined) {
			seen.set(injection.hash, injection.css);
			distinct.push(injection);
		} else {
			expect(mode, `duplicate injectStyle(${injection.hash}) on the client`).toBe('server');
			expect(injection.css).toBe(previous);
		}
	}
	return distinct;
}

function concatenatedCss(code: string, mode: Mode): string {
	return distinctInjections(code, mode)
		.map((injection) => injection.css)
		.join('\n');
}

/**
 * Text forms the compiled code may use for an element's class. Static values
 * sit in `class="…"` (template HTML, `_$template` JSON strings, server
 * template-literal HTML) or `class: "…"` (`createElement` props); anything
 * with a runtime part is a template literal, and an expression-valued authored
 * class with an empty chain stays the bare expression. Octane wraps an
 * expression-valued authored class in `_$normalizeClass(…)`, which the
 * README's `${expr}` form admits as the same thing.
 */
function classCandidates(key: string, chain: string[], hashes: Map<string, string>): string[] {
	const isExpression = key.startsWith('{') && key.endsWith('}');
	const hasRuntime = chain.some(isRuntime);
	const parts = chain.map((label) =>
		isRuntime(label) ? `\${${runtimeExpression(label)}.$class}` : hashOf(label, hashes),
	);
	if (!isExpression) {
		const value = [key, ...parts].join(' ');
		return hasRuntime ? [`\`${value}\``] : [`class="${value}"`, `class: "${value}"`];
	}
	const expression = key.slice(1, -1);
	if (parts.length === 0) {
		return [`(${expression},`, `= ${expression};`, `{${expression}}`];
	}
	return [
		`\`\${${expression}} ${parts.join(' ')}\``,
		`\`\${_$normalizeClass(${expression})} ${parts.join(' ')}\``,
	];
}

/** The `$class` value of an assigned block as the tsrx contract spells it. */
function classExpression(name: string, chain: string[], hashes: Map<string, string>): string {
	const out: string[] = [];
	let literal: string | null = null;
	let previousRuntime = false;
	for (const label of chain) {
		if (isRuntime(label)) {
			if (literal !== null) {
				out.push(`'${literal} '`);
				literal = null;
			} else if (previousRuntime) {
				out.push(`' '`);
			}
			out.push(`${runtimeExpression(label)}.$class`);
			previousRuntime = true;
		} else {
			const hash = hashOf(label === 'own' ? name : label, hashes);
			literal = literal === null ? (previousRuntime ? ` ${hash}` : hash) : `${literal} ${hash}`;
			previousRuntime = false;
		}
	}
	if (literal !== null) out.push(`'${literal}'`);
	return out.join(' + ');
}

// --- evaluation configuration -----------------------------------------------------

interface ImportBinding {
	/** Local binding name in the fixture source. */
	binding: string;
	/** Module request as written in the fixture. */
	from: string;
	/** Named export, or omitted for a namespace import. */
	name?: string;
}

interface Render {
	component: string;
	props?: Record<string, unknown>;
}

interface Evaluation {
	renders: Render[];
	/** Stand-ins for the fixture's imports (real compiled modules or stubs). */
	runtimeModules?: (mode: Mode) => Record<string, Record<string, any>>;
	imports?: ImportBinding[];
	/** Authored keys that no render can reach (e.g. a `@catch` branch). */
	unreachable?: string[];
}

const NOT_EVALUATED: Record<string, string> = {
	'assigned-positions':
		'uses `export { … }` lists, which the shared module loader cannot rewrite — compiled code only',
};

function fixtureNamed(name: string): Fixture {
	const fixture = fixtures.find((candidate) => candidate.name === name);
	if (!fixture) throw new Error(`no fixture named ${name}`);
	return fixture;
}

/** The compiled `rfc-opening-example/theme` module, the RFC's real theme. */
function themeModule(mode: Mode): Record<string, any> {
	const theme = fixtureNamed('rfc-opening-example/theme');
	return loadCompiledFixtureSource(theme.source, { id: theme.path, mode });
}

const THEMES_STUB = { dark: { $class: 'stub-themes-dark', dark: 'stub-themes-dark dark' } };

const EVALUATIONS: Record<string, Evaluation> = {
	'apply-forms': {
		renders: ['SelfClosed', 'ArrayForm', 'WithBody', 'TwoApplies'].map((component) => ({
			component,
		})),
	},
	'control-flow-else-if': {
		renders: [
			{ component: 'ElseIf', props: { a: true, b: false } },
			{ component: 'ElseIf', props: { a: false, b: true } },
			{ component: 'ElseIf', props: { a: false, b: false } },
		],
	},
	'control-flow': {
		renders: [
			{ component: 'ControlFlow', props: { ready: true, items: ['x'], kind: 1 } },
			{ component: 'ControlFlow', props: { ready: false, items: [], kind: 2 } },
			{ component: 'ControlFlow', props: { ready: true, items: ['y'], kind: 3 } },
		],
		unreachable: ['e9 err'],
	},
	'cross-module-apply': {
		renders: [
			{ component: 'CrossModule', props: { active: true } },
			{ component: 'CrossModule', props: { active: false } },
		],
		runtimeModules: (mode) => ({
			'./theme.tsrx': themeModule(mode),
			'./themes.tsrx': THEMES_STUB,
		}),
		imports: [
			{ binding: 'theme', from: './theme.tsrx', name: 'theme' },
			{ binding: 'themes', from: './themes.tsrx' },
		],
	},
	'element-rooted-templates': { renders: [{ component: 'Templates' }] },
	precedence: { renders: [{ component: 'Precedence' }] },
	'rfc-opening-example/panel': {
		renders: [{ component: 'Panel' }],
		runtimeModules: (mode) => ({ './theme.tsrx': themeModule(mode) }),
		imports: [{ binding: 'theme', from: './theme.tsrx', name: 'theme' }],
	},
	'rfc-opening-example/theme': { renders: [] },
	'search-panel': {
		renders: [
			{
				component: 'SearchPanel',
				props: { filters: [{ label: 'a' }], results: [{ title: 't' }] },
			},
		],
	},
	'sibling-scopes': { renders: [{ component: 'Siblings' }] },
	'theme-composition': { renders: [{ component: 'Composed' }] },
	'theme-diamond': { renders: [] },
};

/** Resolve `a.b.c` against the evaluation's import bindings. */
function resolveBinding(
	expression: string,
	evaluation: Evaluation,
	modules: Record<string, Record<string, any>>,
): unknown {
	const [head, ...rest] = expression.split('.');
	const binding = evaluation.imports?.find((entry) => entry.binding === head);
	if (!binding) return undefined;
	let value: any = modules[binding.from];
	if (binding.name !== undefined) value = value?.[binding.name];
	for (const segment of rest) value = value?.[segment];
	return value;
}

function tokens(value: string): string[] {
	return value.split(/\s+/).filter(Boolean);
}

/** The class tokens an element must carry at runtime, `null` if unresolvable. */
function runtimeTokens(
	chain: string[],
	hashes: Map<string, string>,
	evaluation: Evaluation,
	modules: Record<string, Record<string, any>>,
): string[] | null {
	const out: string[] = [];
	for (const label of chain) {
		if (!isRuntime(label)) {
			out.push(hashOf(label, hashes));
			continue;
		}
		const value = resolveBinding(runtimeExpression(label), evaluation, modules);
		if (typeof value !== 'object' || value === null || typeof value.$class !== 'string') {
			return null;
		}
		out.push(...tokens(value.$class));
	}
	return out;
}

/**
 * Check rendered class lists against `elements`: an element whose leading
 * tokens are an authored static value must carry exactly that value plus the
 * resolved chain; an element matching an expression key must end with the
 * chain (and start with the expression's value when it resolves to a known
 * import). Returns the static keys that were seen.
 */
function checkRenderedClasses(
	classLists: string[][],
	expected: Expected,
	hashes: Map<string, string>,
	evaluation: Evaluation,
	modules: Record<string, Record<string, any>>,
	where: string,
): Set<string> {
	const seen = new Set<string>();
	const entries = Object.entries(expected.elements).map(([key, chain]) => {
		const isExpression = key.startsWith('{') && key.endsWith('}');
		const suffix = runtimeTokens(chain, hashes, evaluation, modules);
		let prefix: string[] | null = isExpression ? null : tokens(key);
		if (isExpression) {
			const value = resolveBinding(key.slice(1, -1), evaluation, modules);
			if (typeof value === 'string') prefix = tokens(value);
		}
		return { key, isExpression, prefix, suffix };
	});
	const startsWith = (list: string[], prefix: string[]) =>
		prefix.every((token, index) => list[index] === token);
	const endsWith = (list: string[], suffix: string[]) =>
		suffix.every((token, index) => list[list.length - suffix.length + index] === token);

	for (const classList of classLists) {
		if (classList.length === 0) continue;
		const static_ = entries.find(
			(entry) => !entry.isExpression && entry.prefix && startsWith(classList, entry.prefix),
		);
		if (static_) {
			seen.add(static_.key);
			if (static_.suffix) {
				expect(classList, `${where}: ${static_.key}`).toEqual([
					...static_.prefix!,
					...static_.suffix,
				]);
			}
			continue;
		}
		const expression = entries.find(
			(entry) =>
				entry.isExpression &&
				(!entry.suffix || endsWith(classList, entry.suffix)) &&
				(!entry.prefix || startsWith(classList, entry.prefix)),
		);
		expect(
			expression,
			`${where}: no authored class matches rendered class list "${classList.join(' ')}"`,
		).toBeDefined();
	}
	return seen;
}

/**
 * `order` filtered to the entries `actual` reaches in sequence: equals
 * `actual` exactly when `actual` is an order-preserving subsequence of
 * `order` (with repeats kept), and shows the divergence otherwise.
 */
function subsequenceOf(order: string[], actual: string[]): string[] {
	const out: string[] = [];
	let cursor = 0;
	for (const label of actual) {
		const index = order.indexOf(label, cursor);
		if (index === -1) return order;
		out.push(label);
		cursor = index + 1;
	}
	return out;
}

function htmlClassLists(html: string): string[][] {
	return [...html.matchAll(/\sclass="([^"]*)"/g)].map((match) => tokens(match[1]));
}

// --- suite ----------------------------------------------------------------------------

describe('scoped style conformance fixtures (@tsrx/core test harness)', () => {
	it('finds the shared fixture directory', () => {
		expect(SCOPED_STYLES_FIXTURES_DIR).toMatch(/scoped-styles/);
		expect(fixtures.length).toBeGreaterThan(0);
	});

	it('pins known failures and evaluation notes only for fixtures that exist', () => {
		const names = new Set(fixtures.map((fixture) => fixture.name));
		for (const name of Object.keys(KNOWN_FAILURES)) expect(names.has(name), name).toBe(true);
		for (const name of Object.keys(NOT_EVALUATED)) expect(names.has(name), name).toBe(true);
		for (const name of Object.keys(EVALUATIONS)) expect(names.has(name), name).toBe(true);
	});

	describe.each(fixtures.map((fixture) => [fixture.name, fixture] as const))(
		'%s',
		(name, fixture) => {
			const { expected } = fixture;
			const labels = collectLabels(expected);
			const compiled = Object.fromEntries(
				MODES.map((mode) => [mode, tryCompile(fixture, mode)]),
			) as Record<Mode, Compiled>;
			// Hashes are position-derived, so both modes agree; resolving from
			// the union lets the element checks run even where one mode's sheet
			// is known to be broken.
			const hashes = resolveLabels(
				MODES.map((mode) => concatenatedCss(compiled[mode].code, mode)).join('\n'),
				labels,
			);
			const scopeHashes = [...new Set(expected.cssOrder.map((label) => hashOf(label, hashes)))];
			const assignedLabels = new Set(Object.keys(expected.classMaps));
			const knownFailure = expected.knownFailure;

			describe.each(MODES)('%s', (mode) => {
				const { code, error } = compiled[mode];
				const pinned = knownFailure ?? KNOWN_FAILURES[name]?.[mode];
				// A pinned compile crash fails every check of the mode; a pinned
				// output discrepancy only the sheet check. An unpinned crash fails
				// loudly (the thrown error is rethrown by each check).
				const modeIt = pinned && error ? it.fails : it;
				const sheetIt = pinned ? it.fails : modeIt;
				const suffix = pinned ? ` (known failure: ${pinned})` : '';
				const compiledCode = () => {
					if (error) throw error;
					return code;
				};

				modeIt(`lowers every style element${error ? suffix : ''}`, () => {
					expect(compiledCode()).not.toContain('<style');
				});

				sheetIt(
					`injects scoped sheets in lexical pre-order and prunes only assigned blocks${suffix}`,
					() => {
						const distinct = distinctInjections(compiledCode(), mode);
						const css = distinct.map((injection) => injection.css).join('\n');

						// Marker rules appear in sheet emission order; one injection per hash.
						expect(emittedMarkers(css, labels)).toEqual(expected.cssOrder);
						expect(distinct.map((injection) => injection.hash)).toEqual(scopeHashes);

						// Every scoped selector of a sheet carries that sheet's hash.
						for (const injection of distinct) {
							const foreign = [...injection.css.matchAll(new RegExp(HASH, 'g'))]
								.map((match) => match[0])
								.filter((hash) => hash !== injection.hash);
							expect(foreign, `sheet ${injection.hash}`).toEqual([]);
						}

						// Pruning: standalone-scope sheets keep every selector (Octane's
						// choice), assigned blocks prune exactly what the contract lists.
						const assignedPruned: string[] = [];
						for (const injection of distinct) {
							const markers = new Set(emittedMarkers(injection.css, labels));
							const pruned = prunedSelectors(injection.css);
							const isAssigned =
								markers.size > 0 && [...markers].every((label) => assignedLabels.has(label));
							if (isAssigned) assignedPruned.push(...pruned);
							else expect(pruned, `standalone sheet ${injection.hash}`).toEqual([]);
						}
						for (const selector of assignedPruned) expect(expected.pruned).toContain(selector);
						const expectedAssigned = expected.pruned.filter((selector) =>
							assignedPruned.includes(selector),
						);
						expect(assignedPruned).toEqual(expectedAssigned);
						if ([...labels].every((label) => assignedLabels.has(label))) {
							expect(assignedPruned).toEqual(expected.pruned);
						}
					},
				);

				modeIt(
					`stamps every element with its scope chain and applied themes${error ? suffix : ''}`,
					() => {
						const unescaped = compiledCode().replace(/\\"/g, '"');
						for (const [key, chain] of Object.entries(expected.elements)) {
							const candidates = classCandidates(key, chain, hashes);
							const hit = candidates.some((candidate) => unescaped.includes(candidate));
							expect(
								hit,
								`${key}: expected one of ${JSON.stringify(candidates)} in:\n${unescaped}`,
							).toBe(true);
						}
					},
				);

				modeIt(`composes the $class of every assigned block${error ? suffix : ''}`, () => {
					const code = compiledCode();
					for (const [variable, chain] of Object.entries(expected.classMaps)) {
						const composition = classExpression(variable, chain, hashes);
						// The map literal, on the server possibly wrapped in the lazily
						// injecting `_$styleMap(hash, css, { … }, [applied])`.
						expect(code).toMatch(
							new RegExp(
								`\\b${escapeRegExp(variable)} = (?:_\\$styleMap\\(\\s*${STRING},\\s*${STRING},\\s*)?` +
									`\\{\\s*'\\$class': ${escapeRegExp(composition)}\\s*(?:,|\\})`,
							),
						);
						if (chain.includes(variable) || chain.includes('own')) {
							expect(code).toContain(`'${variable}': '${hashOf(variable, hashes)} ${variable}'`);
						}
					}
				});
			});

			const evaluation = EVALUATIONS[name];
			const notEvaluated = NOT_EVALUATED[name];
			if (evaluation === undefined || notEvaluated !== undefined) {
				// Compiled output is fully checked above; evaluation is deliberately
				// not configured for this fixture (see NOT_EVALUATED for the reason).
				it('is checked on compiled output only', () => {
					expect(notEvaluated ?? 'no evaluation configured').toEqual(expect.any(String));
				});
				return;
			}

			function loadModule(mode: Mode) {
				const modules = evaluation.runtimeModules?.(mode) ?? {};
				const module = loadCompiledFixtureSource(fixture.source, {
					id: fixture.path,
					mode,
					runtimeModules: modules,
				});
				return { module, modules };
			}

			function expectedStaticKeys(): string[] {
				return Object.keys(expected.elements).filter(
					(key) => !(key.startsWith('{') && key.endsWith('}')),
				);
			}

			function checkCoverage(seen: Set<string>, where: string): void {
				if (evaluation.renders.length === 0) return;
				const unreachable = new Set(evaluation.unreachable ?? []);
				for (const key of expectedStaticKeys()) {
					if (!unreachable.has(key))
						expect(seen.has(key), `${where}: ${key} never rendered`).toBe(true);
				}
			}

			function checkClassMapValues(
				module: Record<string, any>,
				modules: Record<string, Record<string, any>>,
			): void {
				for (const [variable, chain] of Object.entries(expected.classMaps)) {
					if (!(variable in module)) continue; // not exported by the fixture
					const value = runtimeTokens(
						chain.map((label) => (label === 'own' ? variable : label)),
						hashes,
						evaluation,
						modules,
					);
					if (value === null) continue;
					expect(tokens(module[variable].$class), variable).toEqual(value);
					if (chain.includes(variable) || chain.includes('own')) {
						expect(module[variable][variable]).toBe(`${hashOf(variable, hashes)} ${variable}`);
					}
				}
			}

			const clientFailure = compiled.client.error
				? (knownFailure ?? KNOWN_FAILURES[name]?.client)
				: undefined;
			const clientIt = clientFailure ? it.fails : it;
			clientIt(
				'mounts the client module with the expected DOM class lists' +
					(clientFailure ? ` (known failure: ${clientFailure})` : ''),
				() => {
					const { module, modules } = loadModule('client');
					checkClassMapValues(module, modules);
					const seen = new Set<string>();
					for (const render of evaluation.renders) {
						const component = module[render.component];
						expect(typeof component, render.component).toBe('function');
						const r = mount(component, render.props as any);
						try {
							// The raw attribute, not classList: a DOMTokenList drops repeated
							// hashes (a theme's own hash recurs when `{theme.dark}` is the
							// authored value) and the contract is the rendered string.
							const classLists = Array.from(r.container.querySelectorAll('*')).map((element) =>
								tokens(element.getAttribute('class') ?? ''),
							);
							expect(r.container.querySelector('style')).toBeNull();
							for (const key of checkRenderedClasses(
								classLists,
								expected,
								hashes,
								evaluation,
								modules,
								`client ${render.component}`,
							)) {
								seen.add(key);
							}
						} finally {
							r.unmount();
						}
					}
					checkCoverage(seen, 'client');
				},
			);

			const serverFailure = knownFailure ?? KNOWN_FAILURES[name]?.server;
			const serverIt = serverFailure && evaluation.renders.length > 0 ? it.fails : it;
			serverIt(
				'renders the server module with the same classes and ordered CSS' +
					(serverFailure && evaluation.renders.length > 0
						? ` (known failure: ${serverFailure})`
						: ''),
				() => {
					const { module, modules } = loadModule('server');
					checkClassMapValues(module, modules);
					const seen = new Set<string>();
					const injectedLabels = new Set<string>();
					for (const render of evaluation.renders) {
						const component = module[render.component];
						expect(typeof component, render.component).toBe('function');
						const { html, css } = ServerRT.renderToString(component, render.props as any);
						expect(html).not.toContain('<style');
						// A component injects the module-level sheets plus its own at
						// its start, so the SSR CSS lists markers in emission order —
						// an order-preserving subsequence of the module's cssOrder.
						const markers = emittedMarkers(css, labels);
						expect(markers, `${render.component} css`).toEqual(
							subsequenceOf(expected.cssOrder, markers),
						);
						for (const label of markers) injectedLabels.add(label);
						for (const key of checkRenderedClasses(
							htmlClassLists(html),
							expected,
							hashes,
							evaluation,
							modules,
							`server ${render.component}`,
						)) {
							seen.add(key);
						}
					}
					checkCoverage(seen, 'server');
					if (evaluation.renders.length > 0) {
						expect([...injectedLabels].sort()).toEqual([...new Set(expected.cssOrder)].sort());
					}
				},
			);
		},
	);
});
