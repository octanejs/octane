import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const INVENTORY_SCHEMA_VERSION = 1;

export const DEFAULT_HELPER_EXPANSIONS = Object.freeze({
	itRenders: {
		registrations: 5,
		modes: ['server-string', 'server-stream', 'client-clean', 'hydrate-match', 'hydrate-mismatch'],
	},
	itClientRenders: {
		registrations: 3,
		modes: ['client-clean', 'hydrate-match', 'hydrate-mismatch'],
	},
	itRendersWithoutSSR: {
		registrations: 3,
		modes: ['client-clean', 'hydrate-match', 'hydrate-mismatch'],
	},
	itThrowsWhenRendering: {
		registrations: 3,
		modes: ['server-string', 'client-clean', 'hydrate-mismatch'],
	},
});

const DIRECT_REGISTRARS = new Set(['it', 'test', 'fit', 'xit']);
const GATED_REGISTRARS = new Set(['_test_gate', '_test_gate_focus']);
const OPEN_TO_CLOSE = new Map([
	['(', ')'],
	['[', ']'],
	['{', '}'],
]);
const REGEX_PREFIX_PUNCTUATORS = new Set([
	'(',
	'[',
	'{',
	',',
	';',
	':',
	'=',
	'=>',
	'!',
	'?',
	'&&',
	'||',
	'??',
	'+',
	'-',
	'*',
	'%',
	'^',
	'&',
	'|',
	'~',
	'<',
	'>',
]);
const REGEX_PREFIX_KEYWORDS = new Set([
	'await',
	'case',
	'delete',
	'do',
	'else',
	'in',
	'instanceof',
	'of',
	'return',
	'throw',
	'typeof',
	'void',
	'yield',
]);

function lineAndColumn(source, offset) {
	let line = 1;
	let lastNewline = -1;
	for (let index = 0; index < offset; index++) {
		if (source.charCodeAt(index) === 10) {
			line++;
			lastNewline = index;
		}
	}
	return { line, column: offset - lastNewline };
}

function consumeQuoted(source, start, quote) {
	let index = start + 1;
	let hasInterpolation = false;
	while (index < source.length) {
		const char = source[index];
		if (char === '\\') {
			index += 2;
			continue;
		}
		if (quote === '`' && char === '$' && source[index + 1] === '{') {
			hasInterpolation = true;
		}
		index++;
		if (char === quote) break;
	}
	return { end: index, hasInterpolation };
}

function consumeRegex(source, start) {
	let index = start + 1;
	let inClass = false;
	while (index < source.length) {
		const char = source[index];
		if (char === '\\') {
			index += 2;
			continue;
		}
		if (char === '[') inClass = true;
		else if (char === ']') inClass = false;
		else if (char === '/' && !inClass) {
			index++;
			while (/[a-z]/i.test(source[index] ?? '')) index++;
			break;
		}
		index++;
	}
	return index;
}

function canStartRegex(previous) {
	return (
		previous === undefined ||
		(previous.type === 'punctuator' && REGEX_PREFIX_PUNCTUATORS.has(previous.value)) ||
		(previous.type === 'identifier' && REGEX_PREFIX_KEYWORDS.has(previous.value))
	);
}

export function tokenizeJavaScript(source) {
	const tokens = [];
	const comments = [];
	let index = 0;
	while (index < source.length) {
		const char = source[index];
		if (/\s/.test(char)) {
			index++;
			continue;
		}
		if (char === '/' && source[index + 1] === '/') {
			const start = index;
			index = source.indexOf('\n', index + 2);
			if (index === -1) index = source.length;
			comments.push({ start, end: index, value: source.slice(start + 2, index) });
			continue;
		}
		if (char === '/' && source[index + 1] === '*') {
			const start = index;
			const close = source.indexOf('*/', index + 2);
			index = close === -1 ? source.length : close + 2;
			comments.push({
				start,
				end: index,
				value: source.slice(start + 2, close === -1 ? index : close),
			});
			continue;
		}
		if (
			char === '/' &&
			canStartRegex(tokens.at(-1)) &&
			!(tokens.at(-1)?.value === '<' && /[A-Za-z>]/.test(source[index + 1] ?? ''))
		) {
			const start = index;
			index = consumeRegex(source, index);
			tokens.push({ type: 'regex', value: source.slice(start, index), start, end: index });
			continue;
		}
		if (char === "'" || char === '"' || char === '`') {
			const start = index;
			const consumed = consumeQuoted(source, index, char);
			index = consumed.end;
			tokens.push({
				type: char === '`' ? 'template' : 'string',
				value: source.slice(start, index),
				start,
				end: index,
				hasInterpolation: consumed.hasInterpolation,
			});
			continue;
		}
		if (/[A-Za-z_$]/.test(char)) {
			const start = index++;
			while (/[\w$]/.test(source[index] ?? '')) index++;
			tokens.push({ type: 'identifier', value: source.slice(start, index), start, end: index });
			continue;
		}
		if (/\d/.test(char)) {
			const start = index++;
			while (/[\w.]/.test(source[index] ?? '')) index++;
			tokens.push({ type: 'number', value: source.slice(start, index), start, end: index });
			continue;
		}
		const start = index;
		const triple = source.slice(index, index + 3);
		const pair = source.slice(index, index + 2);
		if (triple === '...') {
			index += 3;
		} else if (
			['=>', '&&', '||', '??', '?.', '==', '!=', '<=', '>=', '++', '--', '**'].includes(pair)
		) {
			index += 2;
		} else {
			index++;
		}
		tokens.push({ type: 'punctuator', value: source.slice(start, index), start, end: index });
	}
	return { tokens, comments };
}

function buildPairMap(tokens) {
	const pairs = new Map();
	const stack = [];
	for (let index = 0; index < tokens.length; index++) {
		const value = tokens[index].value;
		if (OPEN_TO_CLOSE.has(value)) {
			stack.push({ index, value });
			continue;
		}
		const opening = stack.at(-1);
		if (opening && OPEN_TO_CLOSE.get(opening.value) === value) {
			stack.pop();
			pairs.set(opening.index, index);
			pairs.set(index, opening.index);
		}
	}
	return pairs;
}

function splitArguments(tokens, openIndex, closeIndex) {
	const ranges = [];
	let start = openIndex + 1;
	const stack = [];
	for (let index = start; index < closeIndex; index++) {
		const value = tokens[index].value;
		if (OPEN_TO_CLOSE.has(value)) stack.push(value);
		else if (stack.length && OPEN_TO_CLOSE.get(stack.at(-1)) === value) stack.pop();
		else if (value === ',' && stack.length === 0) {
			ranges.push([start, index]);
			start = index + 1;
		}
	}
	if (start < closeIndex) ranges.push([start, closeIndex]);
	return ranges;
}

function expressionSource(source, tokens, range) {
	if (!range || range[0] >= range[1]) return '';
	return source
		.slice(tokens[range[0]].start, tokens[range[1] - 1].end)
		.replace(/\s+/g, ' ')
		.trim();
}

function decodeLiteral(token) {
	if (!token || (token.type !== 'string' && token.type !== 'template') || token.hasInterpolation) {
		return null;
	}
	const raw = token.value.slice(1, -1);
	return raw.replace(
		/\\(?:u\{([0-9a-f]+)\}|u([0-9a-f]{4})|x([0-9a-f]{2})|n|r|t|b|f|v|0|\r?\n|(.))/gi,
		(match, codePoint, unicode, hex, escaped) => {
			if (codePoint) return String.fromCodePoint(Number.parseInt(codePoint, 16));
			if (unicode) return String.fromCharCode(Number.parseInt(unicode, 16));
			if (hex) return String.fromCharCode(Number.parseInt(hex, 16));
			if (match === '\\n') return '\n';
			if (match === '\\r') return '\r';
			if (match === '\\t') return '\t';
			if (match === '\\b') return '\b';
			if (match === '\\f') return '\f';
			if (match === '\\v') return '\v';
			if (match === '\\0') return '\0';
			if (/^\\\r?\n$/.test(match)) return '';
			return escaped ?? match.slice(1);
		},
	);
}

function literalFromRange(tokens, range) {
	return range && range[1] - range[0] === 1 ? decodeLiteral(tokens[range[0]]) : null;
}

function staticArrayRows(tokens, start, end, pairs) {
	if (tokens[start]?.value !== '[' || pairs.get(start) !== end - 1) return null;
	if (start + 1 === end - 1) return 0;
	let rows = 1;
	const stack = [];
	for (let index = start + 1; index < end - 1; index++) {
		const value = tokens[index].value;
		if (value === '...') return null;
		if (OPEN_TO_CLOSE.has(value)) stack.push(value);
		else if (stack.length && OPEN_TO_CLOSE.get(stack.at(-1)) === value) stack.pop();
		else if (value === ',' && stack.length === 0 && index + 1 < end - 1) rows++;
	}
	return rows;
}

const UNKNOWN_STATIC_VALUE = Symbol('unknown static value');

function splitElements(tokens, start, end) {
	const ranges = [];
	let elementStart = start;
	const stack = [];
	for (let index = start; index < end; index++) {
		const value = tokens[index].value;
		if (OPEN_TO_CLOSE.has(value)) stack.push(value);
		else if (stack.length && OPEN_TO_CLOSE.get(stack.at(-1)) === value) stack.pop();
		else if (value === ',' && stack.length === 0) {
			if (elementStart < index) ranges.push([elementStart, index]);
			elementStart = index + 1;
		}
	}
	if (elementStart < end) ranges.push([elementStart, end]);
	return ranges;
}

function staticValue(tokens, start, end, pairs) {
	if (end - start === 1) {
		const token = tokens[start];
		const literal = decodeLiteral(token);
		if (literal !== null) return literal;
		if (token.type === 'number') return Number(token.value.replaceAll('_', ''));
		if (token.value === 'true') return true;
		if (token.value === 'false') return false;
		if (token.value === 'null') return null;
		if (token.value === 'undefined') return undefined;
	}
	if (tokens[start]?.value === '[' && pairs.get(start) === end - 1) {
		return splitElements(tokens, start + 1, end - 1).map(([itemStart, itemEnd]) =>
			staticValue(tokens, itemStart, itemEnd, pairs),
		);
	}
	return UNKNOWN_STATIC_VALUE;
}

function staticArrayValues(tokens, start, end, pairs) {
	if (tokens[start]?.value !== '[' || pairs.get(start) !== end - 1) return null;
	const values = splitElements(tokens, start + 1, end - 1).map(([itemStart, itemEnd]) =>
		staticValue(tokens, itemStart, itemEnd, pairs),
	);
	return values.some((value) => value === UNKNOWN_STATIC_VALUE) ? null : values;
}

function formatEachValue(value, specifier) {
	if (specifier === 'j') return JSON.stringify(value);
	if (specifier === 'd' || specifier === 'i') return String(Number.parseInt(value, 10));
	if (specifier === 'f') return String(Number(value));
	if (specifier === 'o' || specifier === 'p')
		return typeof value === 'string' ? value : JSON.stringify(value);
	return String(value);
}

function substituteEachTitle(pattern, row, rowIndex) {
	const values = Array.isArray(row) ? [...row] : [row];
	let valueIndex = 0;
	return pattern.replace(/%%|%([sdifjop#])/g, (match, specifier) => {
		if (match === '%%') return '%';
		if (specifier === '#') return String(rowIndex);
		if (valueIndex >= values.length) return match;
		return formatEachValue(values[valueIndex++], specifier);
	});
}

function taggedTemplateRows(token) {
	if (!token || token.type !== 'template') return null;
	const lines = token.value
		.slice(1, -1)
		.split(/\r?\n/)
		.filter((line) => line.trim());
	return Math.max(0, lines.length - 1);
}

function pragmaGate(source, comments, callStart) {
	const expressions = [];
	let cursor = callStart;
	for (let index = comments.length - 1; index >= 0; index--) {
		const comment = comments[index];
		if (comment.end > cursor) continue;
		const gap = source.slice(comment.end, cursor);
		if (!/^\s*$/.test(gap) || (gap.match(/\n/g)?.length ?? 0) > 2) break;
		const match = comment.value.match(/@gate\s+([^\r\n*]+)/);
		if (match) expressions.unshift(match[1].trim());
		cursor = comment.start;
	}
	return expressions.length ? { kind: 'pragma', expressions } : null;
}

function describeEachContexts(source, tokens, pairs) {
	const contexts = [];
	for (let index = 0; index + 4 < tokens.length; index++) {
		if (
			tokens[index].value !== 'describe' ||
			tokens[index + 1].value !== '.' ||
			tokens[index + 2].value !== 'each'
		)
			continue;
		let tableEnd;
		let rowCount = null;
		let cursor = index + 3;
		if (tokens[cursor]?.value === '(') {
			tableEnd = pairs.get(cursor);
			if (tableEnd === undefined) continue;
			const tableArgs = splitArguments(tokens, cursor, tableEnd);
			if (tableArgs.length === 1) rowCount = staticArrayRows(tokens, ...tableArgs[0], pairs);
			cursor = tableEnd + 1;
		} else if (tokens[cursor]?.type === 'template') {
			rowCount = taggedTemplateRows(tokens[cursor]);
			cursor++;
		} else continue;
		if (tokens[cursor]?.value !== '(') continue;
		const invocationEnd = pairs.get(cursor);
		if (invocationEnd === undefined) continue;
		let bodyOpen = null;
		const arrow = tokens.findIndex(
			(token, tokenIndex) =>
				tokenIndex > cursor && tokenIndex < invocationEnd && token.value === '=>',
		);
		const callbackStart = arrow === -1 ? cursor + 1 : arrow + 1;
		for (let tokenIndex = callbackStart; tokenIndex < invocationEnd; tokenIndex++) {
			if (tokens[tokenIndex].value === '{' && pairs.get(tokenIndex) < invocationEnd) {
				bodyOpen = tokenIndex;
				break;
			}
		}
		if (bodyOpen === null) continue;
		contexts.push({
			start: tokens[bodyOpen].end,
			end: tokens[pairs.get(bodyOpen)].start,
			rowCount,
			source: source.slice(tokens[index].start, tokens[cursor].end).replace(/\s+/g, ' ').trim(),
		});
	}
	return contexts;
}

function loopContexts(source, tokens, pairs) {
	const contexts = [];
	const addBody = (kind, labelStart, searchStart, searchEnd) => {
		for (let index = searchStart; index < searchEnd; index++) {
			if (tokens[index]?.value !== '{') continue;
			const close = pairs.get(index);
			if (close === undefined || close > searchEnd) continue;
			contexts.push({
				kind,
				start: tokens[index].end,
				end: tokens[close].start,
				source: source
					.slice(tokens[labelStart].start, tokens[index].end)
					.replace(/\s+/g, ' ')
					.trim(),
			});
			break;
		}
	};
	for (let index = 0; index < tokens.length; index++) {
		if (tokens[index].value === 'for' && tokens[index + 1]?.value === '(') {
			const headerEnd = pairs.get(index + 1);
			if (headerEnd !== undefined) addBody('for', index, headerEnd + 1, tokens.length);
		}
		if (
			tokens[index].value === 'forEach' &&
			tokens[index - 1]?.value === '.' &&
			tokens[index + 1]?.value === '('
		) {
			const invocationEnd = pairs.get(index + 1);
			if (invocationEnd === undefined) continue;
			const arrow = tokens.findIndex(
				(token, tokenIndex) =>
					tokenIndex > index + 1 && tokenIndex < invocationEnd && token.value === '=>',
			);
			addBody('forEach', index, arrow === -1 ? index + 2 : arrow + 1, invocationEnd);
		}
	}
	return contexts;
}

function eachInvocation(tokens, pairs, startIndex) {
	let cursor = startIndex + 1;
	const modifiers = [];
	let each = null;
	while (tokens[cursor]?.value === '.' && tokens[cursor + 1]?.type === 'identifier') {
		const modifier = tokens[cursor + 1].value;
		cursor += 2;
		if (modifier === 'each') each = true;
		else modifiers.push(modifier);
	}
	if (!each)
		return { invocationOpen: tokens[cursor]?.value === '(' ? cursor : null, modifiers, each: null };
	let rowCount = null;
	let rows = null;
	let tableSourceStart = cursor;
	if (tokens[cursor]?.value === '(') {
		const tableClose = pairs.get(cursor);
		if (tableClose === undefined) return { invocationOpen: null, modifiers, each: null };
		const tableArgs = splitArguments(tokens, cursor, tableClose);
		if (tableArgs.length === 1) {
			rowCount = staticArrayRows(tokens, ...tableArgs[0], pairs);
			rows = staticArrayValues(tokens, ...tableArgs[0], pairs);
		}
		cursor = tableClose + 1;
	} else if (tokens[cursor]?.type === 'template') {
		rowCount = taggedTemplateRows(tokens[cursor]);
		cursor++;
	} else return { invocationOpen: null, modifiers, each: null };
	return {
		invocationOpen: tokens[cursor]?.value === '(' ? cursor : null,
		modifiers,
		each: { rowCount, rows, tableStart: tableSourceStart },
	};
}

function makeCaseId(file, kind, identity, occurrence) {
	const hash = createHash('sha256')
		.update(`react-case-v1\0${file}\0${kind}\0${identity}\0${occurrence}`)
		.digest('hex')
		.slice(0, 20);
	return `react-case-v1:${hash}`;
}

function extractCoffeeScriptTestCases(source, file) {
	const { tokens } = tokenizeJavaScript(source);
	const cases = [];
	const occurrences = new Map();
	for (let index = 0; index + 1 < tokens.length; index++) {
		const token = tokens[index];
		if (!DIRECT_REGISTRARS.has(token.value) || tokens[index - 1]?.value === '.') continue;
		const titleToken = tokens[index + 1];
		const title = decodeLiteral(titleToken);
		if (title === null) continue;
		const occurrenceKey = `${token.value}\0${title}`;
		const occurrence = occurrences.get(occurrenceKey) ?? 0;
		occurrences.set(occurrenceKey, occurrence + 1);
		const declarationId = makeCaseId(file, token.value, title, occurrence);
		const location = lineAndColumn(source, token.start);
		cases.push({
			caseId: declarationId,
			declarationId,
			kind: token.value,
			title,
			declaredTitle: title,
			titleExpression: null,
			line: location.line,
			column: location.column,
			modifiers: [],
			gate: null,
			parameterization: null,
			dynamicExpansion: null,
			helperExpansion: null,
			estimatedRegistrations: 1,
			sourceSnippet: source.slice(token.start, titleToken.end).replace(/\s+/g, ' ').trim(),
			manualReviewReason: null,
		});
	}
	return cases;
}

export function extractTestCases(
	source,
	{ file = '<unknown>', helperExpansions = DEFAULT_HELPER_EXPANSIONS } = {},
) {
	if (file.endsWith('.coffee')) return extractCoffeeScriptTestCases(source, file);
	const { tokens, comments } = tokenizeJavaScript(source);
	const pairs = buildPairMap(tokens);
	const describeContexts = describeEachContexts(source, tokens, pairs);
	const loops = loopContexts(source, tokens, pairs);
	const cases = [];
	const occurrences = new Map();
	for (let index = 0; index < tokens.length; index++) {
		const token = tokens[index];
		const name = token.value;
		const isDirect = DIRECT_REGISTRARS.has(name);
		const isGated = GATED_REGISTRARS.has(name);
		const helper = Object.hasOwn(helperExpansions, name) ? helperExpansions[name] : undefined;
		if (!isDirect && !isGated && !helper) continue;
		if (tokens[index - 1]?.value === '.' || tokens[index - 1]?.value === 'function') continue;
		const parsed = isDirect
			? eachInvocation(tokens, pairs, index)
			: {
					invocationOpen: tokens[index + 1]?.value === '(' ? index + 1 : null,
					modifiers: [],
					each: null,
				};
		if (parsed.invocationOpen === null) continue;
		const close = pairs.get(parsed.invocationOpen);
		if (close === undefined) continue;
		const args = splitArguments(tokens, parsed.invocationOpen, close);
		const titleRange = args[isGated ? 1 : 0];
		if (!titleRange) continue;
		const declaredTitle = literalFromRange(tokens, titleRange);
		const titleExpression =
			declaredTitle === null ? expressionSource(source, tokens, titleRange) : null;
		const identity = declaredTitle ?? titleExpression ?? '<missing-title>';
		const occurrenceKey = `${name}\0${identity}`;
		const occurrence = occurrences.get(occurrenceKey) ?? 0;
		occurrences.set(occurrenceKey, occurrence + 1);
		const location = lineAndColumn(source, token.start);
		const outerEach = describeContexts.filter(
			(context) => token.start > context.start && token.start < context.end,
		);
		const outerLoops = loops.filter(
			(context) => token.start > context.start && token.start < context.end,
		);
		const primaryFactor = helper ? helper.registrations : parsed.each ? parsed.each.rowCount : 1;
		const factors = [
			outerLoops.length ? null : primaryFactor,
			...outerEach.map((context) => context.rowCount),
		];
		const estimatedRegistrations = factors.some((factor) => factor === null)
			? null
			: factors.reduce((total, factor) => total * factor, 1);
		const dynamicGate = isGated && args[0] ? expressionSource(source, tokens, args[0]) : null;
		const gate = dynamicGate
			? { kind: 'runtime', expression: dynamicGate }
			: pragmaGate(source, comments, token.start);
		const snippetEnd = Math.min(tokens[close].end, token.start + 320);
		const declarationId = makeCaseId(file, name, identity, occurrence);
		const rowVariants = parsed.each?.rows?.map((row, rowIndex) => ({
			row,
			rowIndex,
			title: declaredTitle === null ? null : substituteEachTitle(declaredTitle, row, rowIndex),
		})) ?? [{ row: null, rowIndex: null, title: declaredTitle }];
		for (const rowVariant of rowVariants)
			cases.push({
				caseId:
					rowVariant.rowIndex === null
						? declarationId
						: makeCaseId(
								file,
								name,
								`${identity}\0row:${rowVariant.rowIndex}:${JSON.stringify(rowVariant.row)}`,
								occurrence,
							),
				declarationId,
				kind: name,
				title: rowVariant.title,
				declaredTitle,
				titleExpression,
				line: location.line,
				column: location.column,
				modifiers: parsed.modifiers,
				gate,
				parameterization:
					parsed.each || outerEach.length
						? {
								kind: parsed.each ? 'test.each' : 'describe.each',
								rowCount: parsed.each?.rowCount ?? 1,
								rowIndex: rowVariant.rowIndex,
								row: rowVariant.row,
								outerRowCounts: outerEach.map((context) => context.rowCount),
								confidence: factors.some((factor) => factor === null) ? 'unknown' : 'exact',
							}
						: null,
				dynamicExpansion:
					outerLoops.length > 0
						? { kind: 'loop', contexts: outerLoops.map((context) => context.source) }
						: null,
				helperExpansion: helper ? { helper: name, ...helper } : null,
				estimatedRegistrations:
					parsed.each?.rows && outerEach.length === 0 && outerLoops.length === 0
						? (helper?.registrations ?? 1)
						: estimatedRegistrations,
				sourceSnippet: source.slice(token.start, snippetEnd).replace(/\s+/g, ' ').trim(),
				manualReviewReason:
					rowVariant.title === null
						? 'The upstream title is a dynamic expression.'
						: outerLoops.length
							? 'The test is registered inside a loop with an unknown expansion count.'
							: estimatedRegistrations === null
								? 'The upstream parameter matrix has a dynamic row count.'
								: null,
			});
	}
	for (let index = 0; index + 3 < tokens.length; index++) {
		if (
			tokens[index].value !== 'ruleTester' ||
			tokens[index + 1].value !== '.' ||
			tokens[index + 2].value !== 'run' ||
			tokens[index + 3].value !== '('
		)
			continue;
		const close = pairs.get(index + 3);
		if (close === undefined) continue;
		const args = splitArguments(tokens, index + 3, close);
		const title = literalFromRange(tokens, args[0]);
		const titleExpression = title === null ? expressionSource(source, tokens, args[0]) : null;
		const identity = title ?? titleExpression ?? '<missing-rule-tester-title>';
		const occurrenceKey = `ruleTester.run\0${identity}`;
		const occurrence = occurrences.get(occurrenceKey) ?? 0;
		occurrences.set(occurrenceKey, occurrence + 1);
		const declarationId = makeCaseId(file, 'ruleTester.run', identity, occurrence);
		const location = lineAndColumn(source, tokens[index].start);
		cases.push({
			caseId: declarationId,
			declarationId,
			kind: 'ruleTester.run',
			title,
			declaredTitle: title,
			titleExpression,
			line: location.line,
			column: location.column,
			modifiers: [],
			gate: null,
			parameterization: null,
			dynamicExpansion: { kind: 'rule-tester-matrix', contexts: ['valid', 'invalid'] },
			helperExpansion: { helper: 'ruleTester.run', registrations: null, modes: [] },
			estimatedRegistrations: null,
			sourceSnippet: source
				.slice(tokens[index].start, Math.min(tokens[close].end, tokens[index].start + 320))
				.replace(/\s+/g, ' ')
				.trim(),
			manualReviewReason:
				'ESLint RuleTester expands valid and invalid fixture matrices at runtime.',
		});
	}
	return cases;
}

export function discoverReactTestFiles(reactRoot, discovery) {
	const pattern = new RegExp(discovery.testPattern);
	const excludes = discovery.excludePathPatterns ?? [];
	const files = [];
	const walk = (relativeDirectory) => {
		const absoluteDirectory = path.join(reactRoot, relativeDirectory);
		if (!existsSync(absoluteDirectory)) return;
		for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true }).sort((a, b) =>
			a.name.localeCompare(b.name),
		)) {
			const relative = path.posix.join(relativeDirectory.split(path.sep).join('/'), entry.name);
			if (excludes.some((excluded) => relative === excluded || relative.startsWith(`${excluded}/`)))
				continue;
			if (entry.isDirectory()) walk(relative);
			else if (entry.isFile() && pattern.test(`/${relative}`)) files.push(relative);
		}
	};
	for (const root of discovery.roots) walk(root);
	return files.sort();
}

export function readGitHead(repositoryRoot) {
	const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' });
	if (result.status !== 0)
		throw new Error(`Cannot read React checkout HEAD: ${result.stderr.trim()}`);
	return result.stdout.trim();
}

export function inventoryFingerprint(inventory) {
	const projection = inventory.suites.map((suite) => ({ file: suite.file, cases: suite.cases }));
	return createHash('sha256').update(JSON.stringify(projection)).digest('hex');
}

export function findPossibleUnexpandedRegistrars(source) {
	const known = new Set([
		...DIRECT_REGISTRARS,
		...GATED_REGISTRARS,
		...Object.keys(DEFAULT_HELPER_EXPANSIONS),
	]);
	const possible = new Map();
	const expression = /\b((?:it|test)[A-Z][A-Za-z0-9_$]*)\s*\(/g;
	let match;
	while ((match = expression.exec(source)) !== null) {
		if (known.has(match[1])) continue;
		const record = possible.get(match[1]) ?? { name: match[1], occurrences: 0 };
		record.occurrences++;
		possible.set(match[1], record);
	}
	return [...possible.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function buildReactInventory({ reactRoot, baseline, upstreams }) {
	const upstream = upstreams.baselines[baseline];
	if (!upstream) throw new Error(`Unknown React baseline ${JSON.stringify(baseline)}.`);
	const head = readGitHead(reactRoot);
	if (head !== upstream.commit)
		throw new Error(`React ${baseline} checkout is ${head}; expected ${upstream.commit}.`);
	const files = discoverReactTestFiles(reactRoot, upstreams.discovery);
	const suites = files.map((file) => {
		const source = readFileSync(path.join(reactRoot, file), 'utf8');
		return {
			file,
			cases: extractTestCases(source, { file }),
			possibleUnexpandedRegistrars: findPossibleUnexpandedRegistrars(source),
		};
	});
	const allCases = suites.flatMap((suite) => suite.cases);
	const declarations = [
		...new Map(allCases.map((testCase) => [testCase.declarationId, testCase])).values(),
	];
	const logicalDeclarations = declarations.length;
	const knownRegistrations = allCases.reduce(
		(total, testCase) => total + (testCase.estimatedRegistrations ?? 0),
		0,
	);
	const minimumRegistrations = allCases.reduce(
		(total, testCase) => total + (testCase.estimatedRegistrations ?? 1),
		0,
	);
	const inventory = {
		schemaVersion: INVENTORY_SCHEMA_VERSION,
		baseline,
		react: { version: upstream.version, commit: upstream.commit, repository: upstreams.repository },
		discovery: upstreams.discovery,
		summary: {
			suites: suites.length,
			logicalDeclarations,
			directDeclarations: declarations.filter((testCase) => testCase.helperExpansion === null)
				.length,
			helperDeclarations: declarations.filter((testCase) => testCase.helperExpansion !== null)
				.length,
			concreteCases: allCases.length,
			knownRegistrations,
			minimumRegistrations,
			unknownExpansionDeclarations: declarations.filter(
				(testCase) => testCase.estimatedRegistrations === null,
			).length,
			gatedDeclarations: declarations.filter((testCase) => testCase.gate !== null).length,
			possibleUnexpandedRegistrarNames: new Set(
				suites.flatMap((suite) => suite.possibleUnexpandedRegistrars.map((item) => item.name)),
			).size,
		},
		suites,
	};
	inventory.fingerprint = inventoryFingerprint(inventory);
	return inventory;
}

export function stableJson(value) {
	return `${JSON.stringify(value, null, 2)}\n`;
}

export function validateUpstreams(upstreams) {
	const errors = [];
	if (upstreams?.schemaVersion !== 1) errors.push('react-upstreams.json schemaVersion must be 1.');
	for (const baseline of ['stable', 'canary']) {
		const entry = upstreams?.baselines?.[baseline];
		if (!entry) errors.push(`react-upstreams.json is missing ${baseline}.`);
		else if (!/^[0-9a-f]{40}$/.test(entry.commit))
			errors.push(`React ${baseline} commit must be a full 40-character SHA.`);
	}
	if (!Array.isArray(upstreams?.discovery?.roots) || !upstreams.discovery.roots.length) {
		errors.push('React discovery roots must be non-empty.');
	}
	return errors;
}

function inventoryCases(inventory) {
	return inventory.suites.flatMap((suite) => suite.cases);
}

export function validateInventory(inventory, upstreams, expectedBaseline) {
	const errors = [];
	if (inventory?.schemaVersion !== INVENTORY_SCHEMA_VERSION)
		errors.push(`${expectedBaseline} inventory schemaVersion is not ${INVENTORY_SCHEMA_VERSION}.`);
	if (inventory?.baseline !== expectedBaseline)
		errors.push(
			`${expectedBaseline} inventory declares baseline ${JSON.stringify(inventory?.baseline)}.`,
		);
	if (inventory?.react?.commit !== upstreams.baselines[expectedBaseline]?.commit)
		errors.push(`${expectedBaseline} inventory commit does not match the pinned upstream.`);
	if (!Array.isArray(inventory?.suites))
		return [...errors, `${expectedBaseline} inventory has no suites.`];
	const sortedFiles = inventory.suites.map((suite) => suite.file).sort();
	if (JSON.stringify(sortedFiles) !== JSON.stringify(inventory.suites.map((suite) => suite.file)))
		errors.push(`${expectedBaseline} inventory suites are not sorted by file.`);
	const cases = inventoryCases(inventory);
	const ids = new Set();
	for (const testCase of cases) {
		if (ids.has(testCase.caseId))
			errors.push(`${expectedBaseline} inventory duplicates ${testCase.caseId}.`);
		ids.add(testCase.caseId);
		if (!/^react-case-v1:[0-9a-f]{20}$/.test(testCase.caseId))
			errors.push(
				`${expectedBaseline} inventory has invalid case ID ${JSON.stringify(testCase.caseId)}.`,
			);
		if (
			testCase.estimatedRegistrations !== null &&
			(!Number.isInteger(testCase.estimatedRegistrations) || testCase.estimatedRegistrations < 1)
		)
			errors.push(`${expectedBaseline} ${testCase.caseId} has an invalid registration estimate.`);
	}
	const declarationCases = [
		...new Map(cases.map((testCase) => [testCase.declarationId, testCase])).values(),
	];
	const declarations = new Set(declarationCases.map((testCase) => testCase.declarationId));
	const recomputedSummary = {
		suites: inventory.suites.length,
		logicalDeclarations: declarations.size,
		directDeclarations: declarationCases.filter((testCase) => testCase.helperExpansion === null)
			.length,
		helperDeclarations: declarationCases.filter((testCase) => testCase.helperExpansion !== null)
			.length,
		concreteCases: cases.length,
		knownRegistrations: cases.reduce(
			(total, testCase) => total + (testCase.estimatedRegistrations ?? 0),
			0,
		),
		minimumRegistrations: cases.reduce(
			(total, testCase) => total + (testCase.estimatedRegistrations ?? 1),
			0,
		),
		unknownExpansionDeclarations: declarationCases.filter(
			(testCase) => testCase.estimatedRegistrations === null,
		).length,
		gatedDeclarations: declarationCases.filter((testCase) => testCase.gate !== null).length,
		possibleUnexpandedRegistrarNames: new Set(
			inventory.suites.flatMap((suite) =>
				suite.possibleUnexpandedRegistrars.map((item) => item.name),
			),
		).size,
	};
	for (const [name, value] of Object.entries(recomputedSummary)) {
		if (inventory.summary?.[name] !== value)
			errors.push(`${expectedBaseline} inventory ${name} summary is stale.`);
	}
	if (inventory.fingerprint !== inventoryFingerprint(inventory))
		errors.push(`${expectedBaseline} inventory fingerprint is stale.`);
	const expected = upstreams.expectedInventories?.[expectedBaseline];
	if (!expected) errors.push(`${expectedBaseline} has no trusted inventory expectation.`);
	else {
		for (const [name, value] of Object.entries(expected)) {
			const actual = name === 'fingerprint' ? inventory.fingerprint : inventory.summary?.[name];
			if (actual !== value)
				errors.push(`${expectedBaseline} inventory ${name} differs from the pinned expectation.`);
		}
	}
	return errors;
}

function triagePolicyForCase(upstreams, file, testCase) {
	const title = testCase?.title ?? testCase?.titleExpression ?? '';
	return upstreams?.triagePolicies?.find(
		(policy) =>
			new RegExp(policy.filePattern).test(file) &&
			(policy.titlePattern === undefined || new RegExp(policy.titlePattern, 'i').test(title)),
	);
}

function upstreamCaseDetails(inventories) {
	const details = new Map();
	for (const inventory of inventories) {
		for (const suite of inventory.suites) {
			for (const testCase of suite.cases) {
				const detail = details.get(testCase.caseId) ?? {
					caseId: testCase.caseId,
					sourceFile: suite.file,
					title: testCase.title,
					titleExpression: testCase.titleExpression,
					baselines: [],
				};
				if (!detail.baselines.includes(inventory.baseline))
					detail.baselines.push(inventory.baseline);
				details.set(testCase.caseId, detail);
			}
		}
	}
	for (const detail of details.values()) detail.baselines.sort();
	return details;
}

export function syncLedger(ledger, inventories, upstreams) {
	const existing = new Map(ledger.entries.map((entry) => [entry.caseId, entry]));
	for (const detail of upstreamCaseDetails(inventories).values()) {
		const current = existing.get(detail.caseId) ?? {};
		const policy = triagePolicyForCase(upstreams, detail.sourceFile, detail);
		const shouldApplyPolicy =
			policy &&
			(!current.status ||
				current.status === 'untriaged' ||
				(policy.replacePlanned === true && current.status === 'planned'));
		const disposition = shouldApplyPolicy
			? {
					status: policy.status,
					classification: policy.classification,
					risk: policy.risk,
					owner: policy.owner,
					workstream: policy.workstream,
					rationale: policy.rationale,
				}
			: {
					status: current.status ?? 'untriaged',
					risk: current.risk ?? 'unassessed',
				};
		const entry = {
			...current,
			...detail,
			...disposition,
		};
		if (entry.titleExpression === null) delete entry.titleExpression;
		existing.set(detail.caseId, entry);
	}
	return {
		$schema: './react-conformance-ledger.schema.json',
		schemaVersion: 1,
		entries: [...existing.values()].sort((a, b) => a.caseId.localeCompare(b.caseId)),
	};
}

const LEDGER_STATUSES = new Set([
	'untriaged',
	'planned',
	'in_progress',
	'covered',
	'documented',
	'blocked',
]);
const LEDGER_CLASSIFICATIONS = new Set(['portable', 'adaptable', 'divergence', 'non_goal']);
const LEDGER_RISKS = new Set(['unassessed', 'critical', 'high', 'medium', 'low']);
const LEDGER_ENTRY_KEYS = new Set([
	'caseId',
	'sourceFile',
	'title',
	'titleExpression',
	'baselines',
	'status',
	'classification',
	'risk',
	'owner',
	'workstream',
	'rationale',
	'evidence',
]);
const EVIDENCE_KEYS = new Set(['file', 'testName', 'modes']);
const EVIDENCE_MODES = new Set([
	'client',
	'server-string',
	'server-stream',
	'hydrate-match',
	'hydrate-mismatch',
	'production-compile',
]);

function isWorkspaceTestEvidence(file) {
	return typeof file === 'string' && /^packages\/[^/]+\/tests\//.test(file);
}

export function validateLedger(ledger, inventories, repoRoot, upstreams) {
	const errors = [];
	if (ledger?.schemaVersion !== 1 || !Array.isArray(ledger?.entries)) {
		return ['React conformance ledger must have schemaVersion 1 and an entries array.'];
	}
	const details = upstreamCaseDetails(inventories);
	const upstreamIds = new Set(details.keys());
	const ledgerIds = new Set();
	for (const entry of ledger.entries) {
		if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
			errors.push('Ledger entries must be objects.');
			continue;
		}
		for (const key of Object.keys(entry)) {
			if (!LEDGER_ENTRY_KEYS.has(key)) errors.push(`Ledger case has unknown field ${key}.`);
		}
		if (!/^react-case-v1:[0-9a-f]{20}$/.test(entry.caseId ?? ''))
			errors.push(`Ledger case has invalid caseId ${JSON.stringify(entry.caseId)}.`);
		if (typeof entry.sourceFile !== 'string' || !/^(packages|scripts)\//.test(entry.sourceFile))
			errors.push(`Ledger case ${entry.caseId} has invalid sourceFile.`);
		if (entry.title !== null && typeof entry.title !== 'string')
			errors.push(`Ledger case ${entry.caseId} has invalid title.`);
		if (entry.title === null && typeof entry.titleExpression !== 'string')
			errors.push(`Ledger case ${entry.caseId} with a dynamic title needs titleExpression.`);
		if (
			!Array.isArray(entry.baselines) ||
			entry.baselines.length === 0 ||
			entry.baselines.some((baseline) => !['stable', 'canary'].includes(baseline)) ||
			new Set(entry.baselines).size !== entry.baselines.length
		)
			errors.push(`Ledger case ${entry.caseId} has invalid baselines.`);
		if (ledgerIds.has(entry.caseId)) errors.push(`Ledger duplicates ${entry.caseId}.`);
		ledgerIds.add(entry.caseId);
		if (!upstreamIds.has(entry.caseId))
			errors.push(`Ledger case ${entry.caseId} is stale or unknown.`);
		const expectedDetail = details.get(entry.caseId);
		if (expectedDetail) {
			for (const name of ['sourceFile', 'title', 'titleExpression']) {
				if ((entry[name] ?? null) !== (expectedDetail[name] ?? null))
					errors.push(`Ledger case ${entry.caseId} has stale ${name}.`);
			}
			if (JSON.stringify(entry.baselines) !== JSON.stringify(expectedDetail.baselines))
				errors.push(`Ledger case ${entry.caseId} has stale baselines.`);
			const policy = triagePolicyForCase(upstreams, expectedDetail.sourceFile, expectedDetail);
			if (policy) {
				if (entry.status === 'untriaged')
					errors.push(`Priority case ${entry.caseId} may not remain untriaged.`);
				const hasDocumentedPolicyOverride =
					entry.status === 'documented' &&
					(entry.classification === 'divergence' || entry.classification === 'non_goal') &&
					LEDGER_RISKS.has(entry.risk) &&
					entry.risk !== 'unassessed' &&
					typeof entry.rationale === 'string' &&
					entry.rationale.trim().length > 0;
				const hasCoveredPortabilityAssessment =
					entry.status === 'covered' &&
					['portable', 'adaptable'].includes(entry.classification) &&
					['portable', 'adaptable'].includes(policy.classification);
				if (
					entry.classification !== policy.classification &&
					!hasDocumentedPolicyOverride &&
					!hasCoveredPortabilityAssessment
				)
					errors.push(
						`Priority case ${entry.caseId} does not satisfy ${policy.id} classification.`,
					);
				if (entry.risk !== policy.risk && !hasDocumentedPolicyOverride)
					errors.push(`Priority case ${entry.caseId} does not satisfy ${policy.id} risk.`);
				for (const name of ['owner', 'workstream']) {
					if (entry[name] !== policy[name])
						errors.push(`Priority case ${entry.caseId} does not satisfy ${policy.id} ${name}.`);
				}
				if (!entry.rationale?.trim())
					errors.push(`Priority case ${entry.caseId} needs a durable rationale.`);
			}
		}
		if (!LEDGER_STATUSES.has(entry.status))
			errors.push(
				`Ledger case ${entry.caseId} has invalid status ${JSON.stringify(entry.status)}.`,
			);
		if (!LEDGER_RISKS.has(entry.risk))
			errors.push(`Ledger case ${entry.caseId} has invalid risk ${JSON.stringify(entry.risk)}.`);
		if (entry.status === 'untriaged') {
			if (entry.classification !== undefined)
				errors.push(`Untriaged ledger case ${entry.caseId} must not claim a classification.`);
			if (entry.risk === 'critical')
				errors.push(`Critical ledger case ${entry.caseId} must be triaged.`);
		} else if (!LEDGER_CLASSIFICATIONS.has(entry.classification)) {
			errors.push(`Triaged ledger case ${entry.caseId} needs a valid classification.`);
		}
		if (
			(entry.classification === 'divergence' || entry.classification === 'non_goal') &&
			!entry.rationale?.trim()
		)
			errors.push(`${entry.classification} case ${entry.caseId} needs a rationale.`);
		if (entry.status === 'covered' && !entry.evidence?.length)
			errors.push(`Covered ledger case ${entry.caseId} has no local evidence.`);
		if (
			['planned', 'in_progress', 'blocked'].includes(entry.status) &&
			(typeof entry.owner !== 'string' ||
				!entry.owner.trim() ||
				typeof entry.rationale !== 'string' ||
				!entry.rationale.trim())
		)
			errors.push(`${entry.status} ledger case ${entry.caseId} needs owner and rationale.`);
		if (entry.evidence !== undefined && !Array.isArray(entry.evidence)) {
			errors.push(`Ledger case ${entry.caseId} evidence must be an array.`);
			continue;
		}
		const evidenceKeys = new Set();
		for (const evidence of entry.evidence ?? []) {
			if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
				errors.push(`${entry.caseId} evidence must be an object.`);
				continue;
			}
			for (const key of Object.keys(evidence)) {
				if (!EVIDENCE_KEYS.has(key))
					errors.push(`${entry.caseId} evidence has unknown field ${key}.`);
			}
			if (!isWorkspaceTestEvidence(evidence.file))
				errors.push(`${entry.caseId} evidence has invalid file.`);
			if (typeof evidence.testName !== 'string' || !evidence.testName.trim())
				errors.push(`${entry.caseId} evidence has invalid testName.`);
			if (
				evidence.modes !== undefined &&
				(!Array.isArray(evidence.modes) ||
					new Set(evidence.modes).size !== evidence.modes.length ||
					evidence.modes.some((mode) => !EVIDENCE_MODES.has(mode)))
			)
				errors.push(`${entry.caseId} evidence has invalid modes.`);
			if (typeof evidence.file !== 'string' || typeof evidence.testName !== 'string') continue;
			const key = `${evidence.file}\0${evidence.testName}`;
			if (evidenceKeys.has(key))
				errors.push(`${entry.caseId} duplicates evidence ${evidence.file}.`);
			evidenceKeys.add(key);
			const absoluteFile = path.resolve(repoRoot, evidence.file);
			if (!absoluteFile.startsWith(`${path.resolve(repoRoot)}${path.sep}`)) {
				errors.push(`${entry.caseId} evidence escapes the repository: ${evidence.file}.`);
				continue;
			}
			if (!existsSync(absoluteFile)) {
				errors.push(`${entry.caseId} evidence file does not exist: ${evidence.file}.`);
				continue;
			}
			if (!readFileSync(absoluteFile, 'utf8').includes(evidence.testName))
				errors.push(`${entry.caseId} evidence test is stale: ${evidence.testName}.`);
		}
	}
	for (const caseId of upstreamIds) {
		if (!ledgerIds.has(caseId)) errors.push(`Ledger is missing upstream case ${caseId}.`);
	}
	return errors;
}

function integer(value) {
	return new Intl.NumberFormat('en-GB').format(value);
}

function coverageFor(inventory, ledgerById) {
	const cases = inventoryCases(inventory);
	const byStatus = Object.fromEntries([...LEDGER_STATUSES].map((status) => [status, 0]));
	const byClassification = Object.fromEntries(
		[...LEDGER_CLASSIFICATIONS].map((classification) => [classification, 0]),
	);
	for (const testCase of cases) {
		const entry = ledgerById.get(testCase.caseId);
		if (!entry) continue;
		byStatus[entry.status]++;
		if (entry.classification) byClassification[entry.classification]++;
	}
	return { byStatus, byClassification };
}

function priorityStats(policy, inventory, upstreams) {
	const cases = inventory.suites.flatMap((suite) =>
		suite.cases.filter(
			(testCase) => triagePolicyForCase(upstreams, suite.file, testCase)?.id === policy.id,
		),
	);
	return {
		cases: cases.length,
		minimumRegistrations: cases.reduce(
			(total, testCase) => total + (testCase.estimatedRegistrations ?? 1),
			0,
		),
	};
}

function possibleRegistrarCounts(inventory) {
	const counts = new Map();
	for (const suite of inventory.suites) {
		for (const candidate of suite.possibleUnexpandedRegistrars) {
			counts.set(candidate.name, (counts.get(candidate.name) ?? 0) + candidate.occurrences);
		}
	}
	return counts;
}

export function renderCoverageReport({ upstreams, inventories, ledger }) {
	const ledgerById = new Map(ledger.entries.map((entry) => [entry.caseId, entry]));
	let markdown = `# React parity coverage (generated)\n\n`;
	markdown += `<!-- GENERATED FILE — do not edit. Refresh with:\n`;
	markdown += `pnpm react-parity:generate -- --baseline stable --react-root /path/to/react-v19.2.7\n`;
	markdown += `pnpm react-parity:generate -- --baseline canary --react-root /path/to/react-main\n`;
	markdown += `-->\n\n`;
	markdown += `This report separates distinct Octane tests, React upstream scenarios, renderer/mode registrations, and CI executions. Those numbers are different units and must not be added together or described interchangeably as “ported React tests.”\n\n`;
	markdown += `## Octane test baseline\n\n`;
	markdown += `| Measure | Count |\n| --- | ---: |\n`;
	const local = upstreams.octaneSuiteBaseline;
	markdown += `| Normal core cases | ${integer(local.normalCoreCases)} |\n`;
	markdown += `| ↳ conformance | ${integer(local.normalCoreBreakdown.conformance)} |\n`;
	markdown += `| ↳ differential | ${integer(local.normalCoreBreakdown.differential)} |\n`;
	markdown += `| ↳ hydration | ${integer(local.normalCoreBreakdown.hydration)} |\n`;
	markdown += `| ↳ other runtime/compiler/SSR | ${integer(local.normalCoreBreakdown.other)} |\n`;
	markdown += `| Profiling-only cases | ${integer(local.profilingOnlyCases)} |\n`;
	markdown += `| Distinct core cases including profiling | ${integer(local.distinctCoreCasesIncludingProfiling)} |\n`;
	markdown += `| Production-compile reruns of normal core | ${integer(local.productionModeReruns)} |\n`;
	markdown += `| All workspace executions | ${integer(local.allWorkspaceExecutions)} |\n`;
	markdown += `| React-source-attributed file upper bound | ${integer(local.reactSourceAttributedFileUpperBound)} cases in ${integer(local.reactSourceAttributedFiles)} files |\n\n`;
	markdown += `The production project reruns the same normal core cases in another compile mode; it is not another set of conformance ports. The React-source-attributed definition is: ${local.reactSourceAttributedDefinition} Counts were measured on ${local.measuredOn}.\n\n`;
	markdown += `## Pinned React inventories\n\n`;
	markdown += `| Baseline | Commit | Suites | Direct declarations | Helper declarations | Concrete cases | Known registrations | Minimum registrations | Unknown expansions |\n`;
	markdown += `| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n`;
	for (const inventory of inventories) {
		const summary = inventory.summary;
		markdown += `| ${inventory.baseline} (${inventory.react.version}) | \`${inventory.react.commit.slice(0, 12)}\` | ${integer(summary.suites)} | ${integer(summary.directDeclarations)} | ${integer(summary.helperDeclarations)} | ${integer(summary.concreteCases)} | ${integer(summary.knownRegistrations)} | ${integer(summary.minimumRegistrations)} | ${integer(summary.unknownExpansionDeclarations)} |\n`;
	}
	markdown += `\nA logical declaration is one source registration site. Static \`.each\` rows become concrete case IDs. “Known registrations” sums expansions that can be proven statically; “minimum registrations” counts every unknown loop/dynamic expansion once, so it remains a lower bound. React DOM server helpers carry their explicit five- or three-mode expansion.\n\n`;
	markdown += `The direct totals include 27 CoffeeScript registrations in \`ReactCoffeeScriptClass-test.coffee\`. The five React-repository ESLint RuleTester suites are represented by explicit unknown-expansion cases and dispositioned as tooling non-goals; no discovered suite is silently empty.\n\n`;
	markdown += `### Possible custom registrar review\n\n`;
	markdown += `These name-pattern candidates look like custom \`it*\`/\`test*\` helpers but are not in the proven expansion registry. Raw occurrences may include ordinary helper calls, comments, or strings, so they are a manual-review queue and are not added to the registration floor.\n\n`;
	markdown += `| Candidate | Stable raw occurrences | Canary raw occurrences |\n`;
	markdown += `| --- | ---: | ---: |\n`;
	const possibleByBaseline = new Map(
		inventories.map((inventory) => [inventory.baseline, possibleRegistrarCounts(inventory)]),
	);
	const possibleNames = [
		...new Set([...possibleByBaseline.values()].flatMap((counts) => [...counts.keys()])),
	].sort();
	for (const name of possibleNames) {
		markdown += `| \`${name}\` | ${integer(possibleByBaseline.get('stable').get(name) ?? 0)} | ${integer(possibleByBaseline.get('canary').get(name) ?? 0)} |\n`;
	}
	markdown += `\n`;
	markdown += `## Ledger coverage\n\n`;
	markdown += `Every concrete case in either pinned inventory has exactly one ledger disposition. Non-critical cases may remain \`untriaged\`; critical cases may not.\n\n`;
	markdown += `| Baseline | Cases | Untriaged | Planned | In progress | Covered | Documented | Blocked |\n`;
	markdown += `| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n`;
	for (const inventory of inventories) {
		const coverage = coverageFor(inventory, ledgerById);
		markdown += `| ${inventory.baseline} | ${integer(inventory.summary.concreteCases)} | ${integer(coverage.byStatus.untriaged)} | ${integer(coverage.byStatus.planned)} | ${integer(coverage.byStatus.in_progress)} | ${integer(coverage.byStatus.covered)} | ${integer(coverage.byStatus.documented)} | ${integer(coverage.byStatus.blocked)} |\n`;
	}
	markdown += `\nClassifications are \`portable\`, \`adaptable\`, \`divergence\`, and \`non_goal\`. A covered case requires live local test evidence; divergence and non-goal dispositions require a rationale.\n\n`;
	markdown += `## Priority migration queue\n\n`;
	markdown += `Suite policies are machine-readable in \`react-upstreams.json\`; the first matching policy owns a case, so the critical URL suite is not diluted by the wider server-integration workstream. Counts are shown as concrete cases / minimum registrations.\n\n`;
	markdown += `| Workstream | Stable | Canary | Risk | Status | Owner | Rationale |\n`;
	markdown += `| --- | ---: | ---: | --- | --- | --- | --- |\n`;
	for (const policy of upstreams.triagePolicies) {
		const stable = priorityStats(
			policy,
			inventories.find((item) => item.baseline === 'stable'),
			upstreams,
		);
		const canary = priorityStats(
			policy,
			inventories.find((item) => item.baseline === 'canary'),
			upstreams,
		);
		markdown += `| ${policy.workstream} | ${integer(stable.cases)} / ${integer(stable.minimumRegistrations)} | ${integer(canary.cases)} / ${integer(canary.minimumRegistrations)} | ${policy.risk} | ${policy.status} | ${policy.owner} | ${policy.rationale} |\n`;
	}
	markdown += `\n### Migration sequence and exit criteria\n\n`;
	markdown += `1. **Wave 1 — critical blockers (completed 2026-07-15):** Effect Event semantics and shared untrusted-URL sanitization are implemented, ported, and linked to executable ledger evidence.\n`;
	markdown += `2. **Wave 2 — public API and reconciliation (completed 2026-07-15):** supported root, fragment, element/Children, and lazy-component outcomes have live evidence; excluded outcomes have durable divergence/non-goal dispositions.\n`;
	markdown += `3. **Wave 3 — scheduling and stores (completed 2026-07-15):** supported update-reconciliation and external-store outcomes have live evidence; excluded class, legacy, Fiber-policy, and optimization-only cases have durable dispositions.\n`;
	markdown += `4. **Wave 4 — server matrix (completed 2026-07-16):** all 612 Fizz and server-integration cases have exited the queue. Exact live evidence covers 439 cases and 173 have conservative durable dispositions; none remain planned. The shared matrix exercises client, buffered SSR, streaming SSR, matching hydration, mismatch recovery, and production compilation; class and legacy React remain explicit non-goals.\n`;
	markdown += `5. **Residual audit (completed 2026-07-16):** every case in the stable/canary union has an assigned risk, owner, workstream, and durable status. There are zero untriaged cases; supported planned work remains visible rather than being mislabeled as a port, while class, legacy, private-renderer, synthetic-event, and Server Component surfaces have explicit non-goal dispositions.\n\n`;
	markdown += `A case exits the queue only as \`covered\` with live local evidence, or as a \`documented\` divergence/non-goal with rationale. Committed conformance work must remain executable; \`skip\`, \`todo\`, and expected-failure placeholders are not completion states.\n\n`;
	markdown += `## Extraction limits\n\n`;
	markdown += `The inventory follows React's pinned OSS source Jest discovery rule: direct files under \`__tests__\` in \`packages\` and \`scripts\`, with the source-config exclusions recorded in [react-upstreams.json](../packages/octane/audit/react-upstreams.json). It recognizes direct \`it\`/\`test\` registrations, gate pragmas and transformed gates, static \`.each\` matrices, registrar loops, and the React DOM server integration helpers. Dynamic loops/matrices are retained as manual-review cases with unknown expansion counts. Possible custom registrar names are recorded per suite for audit rather than silently counted as exact.\n`;
	markdown += `The refresh commands require checkouts at the exact commits pinned in \`react-upstreams.json\`; generation rejects any other HEAD.\n`;
	return markdown;
}
