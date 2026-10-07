/**
 * Advisory scan for the `perf-review` skill. It reads a unified diff, keeps the
 * added lines of shipped package source, and reports candidates for the three
 * hot-path disciplines: stable V8 shapes, DOM work without forced layout, and
 * scheduling that does not add microtask hops or ad-hoc task posters.
 *
 * Every hit is a candidate, not a verdict: the skill's judgment pass decides
 * whether the code is on a hot path. Two checks hold on main without exception,
 * so a hit from either is a defect: every field a hot runtime class declares is
 * assigned unconditionally in its constructor, and every write through a
 * Block or Scope receiver targets one of those declared fields. Together they
 * keep each hot class at one hidden class from allocation onward.
 *
 * Usage:
 *   node scripts/perf-review-scan.mjs                  # merge-base(origin/main) → working tree
 *   node scripts/perf-review-scan.mjs --base <ref>     # merge-base(<ref>) → working tree
 *   node scripts/perf-review-scan.mjs --head <ref>     # merge-base(base, <ref>) → <ref>, committed only
 *   gh pr diff <n> | node scripts/perf-review-scan.mjs --diff -
 *   node scripts/perf-review-scan.mjs --json [path-prefix...]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RUNTIME = 'packages/octane/src/runtime.ts';
const HOT_CLASSES = ['BlockImpl', 'ScopeImpl', 'LiteBlockImpl'];
const CONTEXT_LINES = 25;

const SOURCE_FILE = /^packages\/.+\.(?:ts|tsx|js|mjs|cjs|tsrx)$/;
const NOT_SHIPPED =
	/(?:^|\/)(?:tests?|__tests__|_fixtures|fixtures|datasets|benchmarks?|scripts|examples|e2e)\/|\.(?:test|spec)\.[^/]+$|\.d\.ts$|\.generated\.[^/]+$/;
// The client and server runtimes run per render, node, event, and request. The
// compiler runs once per module, so its own source is out of the default scope;
// review its output by compiling a fixture. Bindings are opt-in by path.
const DEFAULT_SCOPE = ['packages/octane/src/'];
const DEFAULT_EXCLUDE = ['packages/octane/src/compiler/'];

/** Shipped package source, the only files whose shape and scheduling cost reach users. */
export function isScannedFile(file, only = []) {
	if (!SOURCE_FILE.test(file) || NOT_SHIPPED.test(file)) return false;
	if (only.length > 0) return only.some((prefix) => file.startsWith(prefix));
	return (
		DEFAULT_SCOPE.some((prefix) => file.startsWith(prefix)) &&
		!DEFAULT_EXCLUDE.some((prefix) => file.startsWith(prefix))
	);
}

const LOOP_HEADER =
	/\b(?:for|while)\s*(?:await\s*)?\(|\.(?:forEach|map|flatMap|filter|reduce|some|every)\s*\(/;
const DOM_WRITE =
	/\.(?:style\.[\w$]+\s*=(?!=)|setAttribute\s*\(|removeAttribute\s*\(|setProperty\s*\(|appendChild\s*\(|insertBefore\s*\(|removeChild\s*\(|replaceChildren\s*\(|before\s*\(|after\s*\(|remove\s*\(\s*\)|classList\.(?:add|remove|toggle|replace)\s*\()|\.(?:textContent|innerHTML|className|nodeValue|data)\s*=(?!=)/;

const EVIDENCE = {
	shape:
		'Name the receiver. If it is a per-render/per-node object, show one map with %HaveSameMap (benchmarks/runtime-object-shapes) or rewrite it.',
	alloc:
		'Show the call frequency. If it runs per render/node/event, measure allocation with --min-semi-space-size/--max-semi-space-size pinned, or rewrite it.',
	layout:
		'Show reads are batched before any write in the same task (as vtMeasureElements does) or run after paint; a browser trace for user-visible claims.',
	scheduling:
		'MessageChannel-marker test: arm a task before the burst and assert the commit count that precedes it; Event Timing in Chromium for latency claims.',
	poster:
		'Reuse an existing poster or the shared one #1864 settles on; justify a new one in the PR and cover background-tab delivery.',
};

/**
 * Line rules. Each runs on the added line with comments and string contents
 * blanked, so prose and messages do not match.
 */
export const RULES = [
	{
		id: 'delete-operator',
		pattern: /\bdelete\s+[\w$(]/,
		message:
			'`delete` moves the receiver to dictionary mode; on a hot object assign undefined/null or copy without the key.',
		evidence: EVIDENCE.shape,
	},
	{
		id: 'conditional-shape',
		pattern: /\.\.\.\s*\([^()]*?(?:(?<!\?)\?(?![?.])|&&)\s*\{/,
		message:
			'A conditional spread gives one allocation site several hidden classes; give every field a value (undefined/null) in one literal.',
		evidence: EVIDENCE.shape,
	},
	{
		id: 'shape-mutation',
		pattern: /\bObject\.(?:defineProperty|defineProperties|setPrototypeOf|freeze|seal)\s*\(/,
		// A module-scope constant is allocated once, so its map cannot churn.
		skip: (raw) => /^(?:export\s+)?const\s/.test(raw),
		message:
			'Accessor, prototype, and integrity changes give the object its own map; frozen maps can be collected at full GC and deopt readers.',
		evidence: EVIDENCE.shape,
	},
	{
		id: 'holey-array',
		pattern: /\bnew\s+Array\s*\(\s*[^)\s][^)]*\)(?!\s*\.fill\s*\()/,
		message:
			'`new Array(n)` starts HOLEY; fill it (hookMemoCreate uses .fill(null)) or build it packed with push / in index order.',
		evidence: EVIDENCE.shape,
	},
	{
		id: 'rest-or-arguments',
		// Arrow syntax is left out: `(...args: any[]) => any` is far more often a
		// type than a value in this codebase, and a line cannot tell them apart.
		pattern: /\barguments\b|\bfunction\b[^(]*\([^)]*\.\.\.[\w$]+/,
		message:
			'A rest parameter allocates on every call in every tier; `arguments` allocates in Ignition/Sparkplug. Use fixed arity on hot entry points.',
		evidence: EVIDENCE.alloc,
	},
	{
		id: 'layout-read',
		pattern:
			/\.(?:offset(?:Width|Height|Top|Left|Parent)|client(?:Width|Height|Top|Left)|scroll(?:Width|Height|Top|Left)|innerText)\b(?!\s*=(?!=))|\b(?:getBoundingClientRect|getClientRects|getComputedStyle|elementFromPoint|elementsFromPoint|getBBox|scrollIntoView)\s*\(/,
		message:
			'Geometry reads force style and layout when a DOM write precedes them in the same task.',
		evidence: EVIDENCE.layout,
	},
	{
		id: 'microtask-hop',
		pattern: /\bqueueMicrotask\s*\(|\bPromise\.resolve\s*\([^)]*\)\s*\.then\s*\(/,
		message:
			'A microtask is not a yield: no paint or input runs until the checkpoint drains. A hop that renders or commits per value builds a megatask (#1864).',
		evidence: EVIDENCE.scheduling,
	},
	{
		id: 'await-as-yield',
		pattern: /\bawait\s+(?:Promise\.resolve\s*\(\s*\)|null|undefined|0|void\s+0)\s*[;)]/,
		message:
			'Awaiting a settled value is one microtask, not a task boundary; the browser still cannot paint or deliver input.',
		evidence: EVIDENCE.scheduling,
	},
	{
		id: 'schedule-render',
		pattern: /(?<![\w$.])scheduleRender\s*\(/,
		message:
			'New render request site: confirm it coalesces into the one pending flush, not one render+commit per item, value, or dispatch.',
		evidence: EVIDENCE.scheduling,
	},
	{
		id: 'animation-frame',
		pattern: /\brequestAnimationFrame\s*\(/,
		message:
			'rAF runs before the next paint, not after it, and stops in background tabs; it is neither a yield nor post-paint (use schedulePostPaint).',
		evidence: EVIDENCE.poster,
	},
	{
		id: 'task-poster',
		pattern:
			/\bnew\s+MessageChannel\s*\(|\bsetImmediate\s*\(|\bscheduler\.postTask\s*\(|\brequestIdleCallback\s*\(|\bsetTimeout\s*\(/,
		message:
			'New ad-hoc task poster: the runtime already has schedulePostPaint, actCheckpoint, resumeOnSettle, and createResizeObserver posters.',
		evidence: EVIDENCE.poster,
	},
];

/** Blank comments and string/template contents so only code can match. */
export function codeOnly(line, state = { inBlock: false }) {
	let out = '';
	let i = 0;
	while (i < line.length) {
		if (state.inBlock) {
			const close = line.indexOf('*/', i);
			if (close === -1) return out;
			state.inBlock = false;
			i = close + 2;
			continue;
		}
		const ch = line[i];
		const next = line[i + 1];
		if (ch === '/' && next === '/') return out;
		if (ch === '/' && next === '*') {
			state.inBlock = true;
			i += 2;
			continue;
		}
		if (ch === "'" || ch === '"' || ch === '`') {
			let j = i + 1;
			while (j < line.length && line[j] !== ch) j += line[j] === '\\' ? 2 : 1;
			out += ch + ch;
			i = j + 1;
			continue;
		}
		out += ch;
		i++;
	}
	return out;
}

/** Parse a unified diff into files of hunks; each line keeps its kind and new-file line number. */
export function parseDiff(text) {
	const files = [];
	let file = null;
	let hunk = null;
	let lineNo = 0;
	for (const raw of text.split('\n')) {
		if (raw.startsWith('diff --git ')) {
			file = null;
			hunk = null;
			continue;
		}
		if (raw.startsWith('+++ ')) {
			const target = raw.slice(4).trim();
			file = target === '/dev/null' ? null : { path: target.replace(/^b\//, ''), hunks: [] };
			if (file) files.push(file);
			hunk = null;
			continue;
		}
		if (raw.startsWith('--- ')) continue;
		const header = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
		if (header) {
			if (!file) continue;
			hunk = [];
			file.hunks.push(hunk);
			lineNo = Number(header[1]);
			continue;
		}
		if (!hunk) continue;
		if (raw.startsWith('+')) hunk.push({ kind: 'add', line: lineNo++, text: raw.slice(1) });
		else if (raw.startsWith(' ')) hunk.push({ kind: 'ctx', line: lineNo++, text: raw.slice(1) });
	}
	return files;
}

/** Walk back from `index` to the innermost enclosing loop header in the visible hunk. */
function enclosingLoop(code, index) {
	let depth = 0;
	for (let i = index - 1; i >= 0; i--) {
		const text = code[i];
		for (let j = text.length - 1; j >= 0; j--) {
			if (text[j] === '}') depth++;
			else if (text[j] === '{') depth--;
		}
		if (depth < 0) {
			if (LOOP_HEADER.test(text)) return i;
			if (/\bfunction\b|=>/.test(text)) return -1;
			depth = 0;
		}
	}
	return -1;
}

/** Zero-delay or omitted-delay setTimeout is a task poster; a real delay is a timer. */
function isTimerWithDelay(source, at) {
	const open = source.indexOf('(', at);
	let depth = 0;
	let lastComma = -1;
	for (let i = open; i < source.length; i++) {
		const ch = source[i];
		if (ch === '(' || ch === '[' || ch === '{') depth++;
		else if (ch === ')' || ch === ']' || ch === '}') {
			depth--;
			if (depth === 0) {
				if (lastComma === -1) return false;
				const delay = source.slice(lastComma + 1, i).trim();
				return delay !== '' && delay !== '0';
			}
		} else if (ch === ',' && depth === 1) lastComma = i;
	}
	// The call does not close inside the visible hunk; keep it as a candidate.
	return false;
}

// Receivers that hold a runtime Block or Scope by naming convention, including
// through a cast: `(b as any).__activitySlot = state` forked the Block map until
// #990. Signals and the universal renderer have their own scope types.
const HOT_RECEIVER =
	/(?<![.\w$])(block|scope|b|CURRENT_BLOCK|CURRENT_SCOPE|[a-z][\w$]*Block|[a-z][\w$]*Scope)!?(?:\s+as\s+[^)]+\))?\.([\w$]+)\s*(?:=|\|\|=|\?\?=|&&=)(?!=)/g;

function writesHotRecords(file) {
	return (
		file.startsWith('packages/octane/src/') &&
		!/^packages\/octane\/src\/(?:compiler|signals)\/|\/universal[^/]*$/.test(file)
	);
}

/** Every field the hot classes declare: the only properties a Block or Scope may carry. */
export function hotClassFields(source, classes = HOT_CLASSES) {
	const fields = new Set();
	for (const name of classes) {
		const found = classBody(source, name);
		if (found === null) continue;
		for (const field of readHotClass(found.body, found.line).fields) fields.add(field.name);
	}
	return fields;
}

/** Scan parsed diff files for line-rule candidates on added lines. */
export function scanFiles(files, { only = [], hotFields = null } = {}) {
	const findings = [];
	for (const file of files) {
		if (!isScannedFile(file.path, only)) continue;
		for (const hunk of file.hunks) {
			const state = { inBlock: false };
			const code = hunk.map((entry) => codeOnly(entry.text, state));
			const joined = code.join('\n');
			const offsets = [];
			let offset = 0;
			for (const text of code) {
				offsets.push(offset);
				offset += text.length + 1;
			}
			hunk.forEach((entry, index) => {
				if (entry.kind !== 'add') return;
				if (hotFields !== null && writesHotRecords(file.path)) {
					for (const match of code[index].matchAll(HOT_RECEIVER)) {
						if (hotFields.has(match[2])) continue;
						findings.push({
							file: file.path,
							line: entry.line,
							rule: 'hot-field-write',
							message: `\`${match[1]}.${match[2]}\` is not a field BlockImpl, ScopeImpl, or LiteBlockImpl declares; adding it after allocation transitions the map.`,
							evidence:
								'Declare the field and assign it in the constructor, or keep the state in a slot or side table.',
							notes: [],
							source: entry.text.trim(),
						});
					}
				}
				for (const rule of RULES) {
					const match = rule.pattern.exec(code[index]);
					if (!match || rule.skip?.(entry.text) === true) continue;
					if (rule.id === 'task-poster' && /setTimeout/.test(match[0])) {
						if (isTimerWithDelay(joined, offsets[index] + match.index)) continue;
					}
					if (rule.id === 'schedule-render' && /\bfunction\s+scheduleRender\b/.test(code[index]))
						continue;
					const notes = [];
					if (
						rule.id === 'microtask-hop' ||
						rule.id === 'schedule-render' ||
						rule.id === 'task-poster'
					) {
						const loop = enclosingLoop(code, index);
						if (loop !== -1) notes.push(`inside the loop at line ${hunk[loop].line}`);
					}
					if (rule.id === 'layout-read') {
						for (let i = index - 1; i >= 0; i--) {
							if (DOM_WRITE.test(code[i])) {
								notes.push(`after the DOM write at line ${hunk[i].line}`);
								break;
							}
						}
					}
					findings.push({
						file: file.path,
						line: entry.line,
						rule: rule.id,
						message: rule.message,
						evidence: rule.evidence,
						notes,
						source: entry.text.trim(),
					});
				}
			});
		}
	}
	return findings;
}

function classBody(source, name) {
	const start = source.indexOf(`class ${name} {`);
	if (start === -1) return null;
	const open = source.indexOf('{', start);
	let depth = 0;
	for (let i = open; i < source.length; i++) {
		if (source[i] === '{') depth++;
		else if (source[i] === '}' && --depth === 0) {
			return { body: source.slice(open + 1, i), line: source.slice(0, open).split('\n').length };
		}
	}
	return null;
}

const MEMBER_FIELD = /^\s*(declare\s+)?(?:readonly\s+)?([\w$]+)\??\s*[:=]/;

/** Read a class body's instance fields and its constructor's `this.x =` assignments. */
function readHotClass(body, line) {
	const fields = [];
	const assignments = [];
	let depth = 0;
	let ctorHeader = false;
	let ctorDepth = -1;
	body.split('\n').forEach((text, index) => {
		const code = codeOnly(text);
		const at = depth;
		const inCtor = ctorDepth !== -1;
		if (at === 0 && /^\s*constructor\s*\(/.test(code)) ctorHeader = true;
		if (at === 0 && !ctorHeader) {
			const field = MEMBER_FIELD.exec(code);
			if (field) fields.push({ name: field[2], declared: field[1] !== undefined });
		}
		for (const ch of code) {
			if (ch === '{') {
				if (ctorHeader && depth === 0) {
					ctorHeader = false;
					ctorDepth = 1;
				}
				depth++;
			} else if (ch === '}') {
				depth--;
				if (ctorDepth !== -1 && depth === 0) ctorDepth = -1;
			}
		}
		if (!inCtor) return;
		for (const match of code.matchAll(/\bthis\.([\w$]+)\s*=(?!=)/g)) {
			assignments.push({
				name: match[1],
				line: line + index,
				source: text.trim(),
				conditional: at > 1 || /^\s*(?:if|else|for|while|switch|case)\b/.test(code),
			});
		}
	});
	return { fields, assignments };
}

/**
 * Structural check: each hot class declares its fields type-only and assigns
 * every one unconditionally in its constructor, so no instance transitions its
 * map after allocation. Shipped source is compiled by consumers, possibly with
 * native class-field semantics, which is why runtime class fields are reported.
 */
export function checkHotClasses(source, classes = HOT_CLASSES, file = RUNTIME) {
	const findings = [];
	const report = (line, message, evidence, source) =>
		findings.push({ file, line, rule: 'hot-class-shape', message, evidence, notes: [], source });
	for (const name of classes) {
		const found = classBody(source, name);
		if (found === null) continue;
		const { fields, assignments } = readHotClass(found.body, found.line);
		const plain = fields.filter((field) => !field.declared).map((field) => field.name);
		if (plain.length > 0) {
			report(
				found.line,
				`${name} has runtime class fields (${plain.join(', ')}); under native class-field semantics each is defined before the constructor runs.`,
				'Use `declare` fields so the constructor assignment order is the only shape definition (see the BlockImpl doc comment).',
				`class ${name}`,
			);
		}
		const assigned = new Set(assignments.map((entry) => entry.name));
		for (const entry of assignments) {
			if (!entry.conditional) continue;
			report(
				entry.line,
				`${name}.${entry.name} is assigned conditionally in the constructor, so instances can differ in shape.`,
				'Assign every field unconditionally, in one fixed order.',
				entry.source,
			);
		}
		for (const field of fields) {
			if (!field.declared || assigned.has(field.name)) continue;
			report(
				found.line,
				`${name} declares \`${field.name}\` but its constructor never assigns it; the first later write transitions the map.`,
				'Initialize it in the constructor (null/undefined/0 for feature-only fields), as BlockImpl does.',
				`class ${name}`,
			);
		}
		const known = new Set(fields.map((field) => field.name));
		for (const field of assigned) {
			if (known.has(field)) continue;
			report(
				found.line,
				`${name}'s constructor assigns \`${field}\` without a \`declare\` field; keep the declared list as the shape inventory.`,
				'Add the declaration next to the related fields.',
				`class ${name}`,
			);
		}
	}
	return findings;
}

let ROOT;
/** The checkout the command runs in, so the scan works from any subdirectory. */
function root() {
	return (ROOT ??= git(['rev-parse', '--show-toplevel'], process.cwd()).trim());
}

function git(args, cwd = root()) {
	return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

/** Where `target` forked from `ref`, or from main when no ref is given. */
function resolveBase(ref, target = 'HEAD') {
	for (const candidate of [ref, 'origin/main', 'main'].filter(Boolean)) {
		try {
			return git(['merge-base', target, candidate]).trim();
		} catch {}
	}
	throw new Error('Could not resolve a base; pass --base <ref> or --diff <file>.');
}

function readOptions(argv) {
	const options = { base: undefined, head: undefined, diff: undefined, json: false, only: [] };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--base') options.base = argv[++i];
		else if (arg === '--head') options.head = argv[++i];
		else if (arg === '--diff') options.diff = argv[++i];
		else if (arg === '--json') options.json = true;
		else if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}`);
		else options.only.push(arg.replace(/^\.\//, ''));
	}
	return options;
}

function collect(options) {
	if (options.diff !== undefined) {
		const text = readFileSync(options.diff === '-' ? 0 : options.diff, 'utf8');
		const runtime = path.join(root(), RUNTIME);
		// The local checkout stands in for the diff's runtime.ts, so its shape is
		// only an approximation of the reviewed head's.
		return {
			text,
			exact: false,
			runtime: () => (existsSync(runtime) ? readFileSync(runtime, 'utf8') : null),
		};
	}
	const unified = `--unified=${CONTEXT_LINES}`;
	if (options.head !== undefined) {
		const base = resolveBase(options.base, options.head);
		return {
			text: git([
				'diff',
				'--no-color',
				'--no-ext-diff',
				unified,
				base,
				options.head,
				'--',
				'packages',
			]),
			exact: true,
			runtime: () => git(['show', `${options.head}:${RUNTIME}`]),
		};
	}
	const base = resolveBase(options.base);
	let text = git(['diff', '--no-color', '--no-ext-diff', unified, base, '--', 'packages']);
	// Untracked files are wholly new; include them as added lines.
	for (const file of git(['ls-files', '--others', '--exclude-standard', '--', 'packages']).split(
		'\n',
	)) {
		if (!file || !isScannedFile(file, options.only)) continue;
		const lines = readFileSync(path.join(root(), file), 'utf8').split('\n');
		text += `\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n${lines.map((l) => '+' + l).join('\n')}\n`;
	}
	return { text, exact: true, runtime: () => readFileSync(path.join(root(), RUNTIME), 'utf8') };
}

/** Fields a diff declares in runtime.ts, which a stand-in checkout may not have yet. */
export function addedDeclarations(files) {
	const fields = new Set();
	for (const file of files) {
		if (file.path !== RUNTIME) continue;
		for (const hunk of file.hunks) {
			for (const entry of hunk) {
				const match = entry.kind === 'add' && /^\s*declare\s+([\w$]+)\??\s*:/.exec(entry.text);
				if (match) fields.add(match[1]);
			}
		}
	}
	return fields;
}

/** Collapse runs of one rule in one file (within 15 lines) so a block of similar lines reads once. */
function groupFindings(findings) {
	const groups = [];
	for (const f of findings) {
		const last = groups.at(-1);
		if (
			last !== undefined &&
			last.file === f.file &&
			last.rule === f.rule &&
			f.rule !== 'hot-class-shape' &&
			f.line - last.lines.at(-1) <= 15
		) {
			last.lines.push(f.line);
			continue;
		}
		groups.push({ ...f, lines: [f.line] });
	}
	return groups;
}

export function formatFindings(findings) {
	if (findings.length === 0) return 'perf-review-scan: no candidates in the scanned diff.\n';
	let out = '';
	let current = '';
	for (const g of groupFindings(findings)) {
		if (g.file !== current) {
			current = g.file;
			out += `\n${g.file}\n`;
		}
		const more =
			g.lines.length > 1 ? ` (+${g.lines.length - 1} more: ${g.lines.slice(1).join(', ')})` : '';
		const notes = g.notes.length > 0 ? ` (${g.notes.join('; ')})` : '';
		out += `  ${g.file}:${g.line}  [${g.rule}]${notes}${more}\n`;
		out += `    ${g.source}\n    ${g.message}\n    evidence: ${g.evidence}\n`;
	}
	const counts = {};
	for (const f of findings) counts[f.rule] = (counts[f.rule] ?? 0) + 1;
	out += `\nperf-review-scan: ${findings.length} candidate line(s): ${Object.entries(counts)
		.map(([rule, n]) => `${rule} ${n}`)
		.join(', ')}. Each needs a hot/cold judgment, not an automatic fix.\n`;
	return out;
}

export function run(argv) {
	const options = readOptions(argv);
	const { text, exact, runtime } = collect(options);
	const files = parseDiff(text);
	const scanned = files.filter((file) => isScannedFile(file.path, options.only));
	const source = scanned.some((file) => writesHotRecords(file.path)) ? runtime() : null;
	const hotFields = source === null ? null : hotClassFields(source);
	if (hotFields !== null && !exact)
		for (const field of addedDeclarations(files)) hotFields.add(field);
	const findings = scanFiles(files, { only: options.only, hotFields });
	// The structural check needs the reviewed head's runtime.ts; a pasted diff
	// does not carry it, so use --head for that check.
	if (exact && source !== null && scanned.some((file) => file.path === RUNTIME)) {
		findings.push(...checkHotClasses(source));
	}
	return findings;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	try {
		const findings = run(process.argv.slice(2));
		const json = process.argv.includes('--json');
		process.stdout.write(
			json ? JSON.stringify(findings, null, 2) + '\n' : formatFindings(findings),
		);
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exit(2);
	}
}
