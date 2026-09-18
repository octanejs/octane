// bippy/source compatibility layer. The pure path/stack utilities are
// reimplemented against their observed contract; `getOwnerStack`/`getSource`
// resolve through Octane's devtools scope graph instead of React fibers.

import { getOctaneDevtoolsHook, scopeDefinitionSite, scopeUsageSite } from './octane-hook.js';
import type { Fiber, ScopedFiber } from './index.js';

export interface StackFrame {
	args?: unknown[];
	columnNumber?: number;
	lineNumber?: number;
	enclosingLineNumber?: number;
	enclosingColumnNumber?: number;
	fileName?: string;
	functionName?: string;
	source?: string;
	isServer?: boolean;
	isSymbolicated?: boolean;
	isIgnoreListed?: boolean;
}

export interface FiberSource {
	columnNumber?: number;
	fileName: string;
	lineNumber?: number;
	functionName?: string;
}

interface ParseOptions {
	slice?: number | [number, number];
	allowEmpty?: boolean;
	includeInElement?: boolean;
}

const SCHEME_REGEX = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;

const INTERNAL_SCHEME_PREFIXES = [
	'rsc://',
	'file:///',
	'webpack-internal://',
	'webpack://',
	'node:',
	'turbopack://',
	'metro://',
	'/app-pages-browser/',
	'/(app-pages-browser)/',
] as const;

const ABOUT_REACT_PREFIX = 'about://React/';

const ANONYMOUS_FILE_PATTERNS = ['<anonymous>', 'eval', ''] as const;

const SOURCE_FILE_EXTENSION_REGEX = /\.(cjs|cts|js|jsx|mdx|mjs|mts|ts|tsx)$/;

const BUNDLED_FILE_PATTERN_REGEX =
	/(\.min|bundle|chunk|vendor|vendors|runtime|polyfill|polyfills)\.(js|mjs|cjs)$|(chunk|bundle|vendor|vendors|runtime|polyfill|polyfills|framework|app|main|index)[-_.][A-Za-z0-9_-]{4,}\.(js|mjs|cjs)$|[\da-f]{8,}\.(js|mjs|cjs)$|[-_.][\da-f]{20,}\.(js|mjs|cjs)$|\/dist\/|\/build\/|\/.next\/|\/out\/|\/node_modules\/|\.webpack\.|\.vite\.|\.turbopack\./i;

const QUERY_PARAMETER_PATTERN_REGEX = /^\?[\w~.-]+(?:=[^&#]*)?(?:&[\w~.-]+(?:=[^&#]*)?)*$/;

const REACT_STACK_BOTTOM_FRAME_PATTERNS = [
	'react_stack_bottom_frame',
	'react-stack-bottom-frame',
] as const;

const getPathSegmentCount = (path: string): number => path.split('/').filter(Boolean).length;

const stripSingleBasePathPrefix = (path: string): string => {
	const firstSlashIndex = path.indexOf('/', 1);
	if (firstSlashIndex === -1) {
		return path;
	}
	const basePath = path.slice(0, firstSlashIndex);
	if (getPathSegmentCount(basePath) !== 1) {
		return path;
	}
	const remainderPath = path.slice(firstSlashIndex);
	if (!SOURCE_FILE_EXTENSION_REGEX.test(remainderPath)) {
		return path;
	}
	const remainderSegments = remainderPath.split('/').filter(Boolean);
	if (remainderSegments.length < 2) {
		return path;
	}
	const firstRemainderSegment = remainderSegments[0];
	if (firstRemainderSegment.length > 4) {
		return path;
	}
	return remainderPath;
};

export const normalizeFileName = (fileName: string): string => {
	if (!fileName) {
		return '';
	}
	if ((ANONYMOUS_FILE_PATTERNS as readonly string[]).some((pattern) => pattern === fileName)) {
		return '';
	}
	let normalizedFileName = fileName;
	const isWindowsDrivePath = /^[a-zA-Z]:[\\/]/.test(normalizedFileName);
	const isHttpUrl =
		normalizedFileName.startsWith('http://') || normalizedFileName.startsWith('https://');
	if (isHttpUrl) {
		try {
			const parsedUrl = new URL(normalizedFileName);
			normalizedFileName = parsedUrl.pathname;
		} catch {}
		normalizedFileName = stripSingleBasePathPrefix(normalizedFileName);
	}
	if (normalizedFileName.startsWith(ABOUT_REACT_PREFIX)) {
		const remainder = normalizedFileName.slice(ABOUT_REACT_PREFIX.length);
		const slashIndex = remainder.indexOf('/');
		const colonIndex = remainder.indexOf(':');
		if (slashIndex !== -1 && (colonIndex === -1 || slashIndex < colonIndex)) {
			normalizedFileName = remainder.slice(slashIndex + 1);
		} else {
			normalizedFileName = remainder;
		}
	}
	let didStripPrefix = true;
	while (didStripPrefix) {
		didStripPrefix = false;
		for (const prefix of INTERNAL_SCHEME_PREFIXES) {
			if (normalizedFileName.startsWith(prefix)) {
				normalizedFileName = normalizedFileName.slice(prefix.length);
				if (prefix === 'file:///') {
					normalizedFileName = `/${normalizedFileName.replace(/^\/+/, '')}`;
				}
				didStripPrefix = true;
				break;
			}
		}
	}
	if (!isWindowsDrivePath) {
		const schemeMatch = normalizedFileName.match(SCHEME_REGEX);
		if (schemeMatch) {
			normalizedFileName = normalizedFileName.slice(schemeMatch[0].length);
		}
	}
	if (normalizedFileName.startsWith('//')) {
		const firstPathSlashIndex = normalizedFileName.indexOf('/', 2);
		normalizedFileName =
			firstPathSlashIndex === -1 ? '' : normalizedFileName.slice(firstPathSlashIndex);
	}
	const queryParameterIndex = normalizedFileName.indexOf('?');
	if (queryParameterIndex !== -1) {
		const potentialQueryParameters = normalizedFileName.slice(queryParameterIndex);
		if (QUERY_PARAMETER_PATTERN_REGEX.test(potentialQueryParameters)) {
			normalizedFileName = normalizedFileName.slice(0, queryParameterIndex);
		}
	}
	return normalizedFileName;
};

export const isSourceFile = (fileName: string): boolean => {
	const normalizedFileName = normalizeFileName(fileName);
	if (!normalizedFileName) {
		return false;
	}
	if (!SOURCE_FILE_EXTENSION_REGEX.test(normalizedFileName)) {
		return false;
	}
	if (BUNDLED_FILE_PATTERN_REGEX.test(normalizedFileName)) {
		return false;
	}
	return true;
};

const FIREFOX_SAFARI_STACK_REGEXP = /(^|@)\S+:\d+/;
const CHROME_IE_STACK_REGEXP = /^\s*at .*(\S+:\d+|\(native\))/m;
const SAFARI_NATIVE_CODE_REGEXP = /^(eval@)?(\[native code\])?$/;

const getPositionIndex = (location: string, endIndex: number): number => {
	let positionIndex = endIndex - 1;
	while (positionIndex >= 0) {
		const character = location.charCodeAt(positionIndex);
		if (character < 48 || character > 57) break;
		positionIndex--;
	}
	return positionIndex < endIndex - 1 && location.charCodeAt(positionIndex) === 58
		? positionIndex
		: -1;
};

const extractLocation = (urlLike: string): [string, string | undefined, string | undefined] => {
	if (!urlLike.includes(':')) return [urlLike, undefined, undefined];
	const isWrappedLocation = urlLike.startsWith('(') && /:\d+\)$/.test(urlLike);
	const sanitizedResult = isWrappedLocation ? urlLike.slice(1, -1) : urlLike;
	if (/[\n\r\u2028\u2029]/.test(sanitizedResult)) {
		const parts = /(.+?)(?::(\d+))?(?::(\d+))?$/.exec(sanitizedResult);
		return parts
			? [parts[1], parts[2] || undefined, parts[3] || undefined]
			: [sanitizedResult, undefined, undefined];
	}
	const lastPositionIndex = getPositionIndex(sanitizedResult, sanitizedResult.length);
	if (lastPositionIndex <= 0) return [sanitizedResult, undefined, undefined];
	const previousPositionIndex = getPositionIndex(sanitizedResult, lastPositionIndex);
	if (previousPositionIndex <= 0) {
		return [
			sanitizedResult.slice(0, lastPositionIndex),
			sanitizedResult.slice(lastPositionIndex + 1),
			undefined,
		];
	}
	return [
		sanitizedResult.slice(0, previousPositionIndex),
		sanitizedResult.slice(previousPositionIndex + 1, lastPositionIndex),
		sanitizedResult.slice(lastPositionIndex + 1),
	];
};

const parseV8Line = (line: string): StackFrame => {
	let currentLine = line;
	if (currentLine.includes('(eval ')) {
		currentLine = currentLine
			.replace(/eval code/g, 'eval')
			.replace(/(\(eval at [^()]*)|(,.*$)/g, '');
	}
	let sanitizedLine = currentLine
		.replace(/^\s+/, '')
		.replace(/\(eval code/g, '(')
		.replace(/^.*?\s+/, '');
	const locationMatch = sanitizedLine.match(/ (\(.+\)$)/);
	sanitizedLine = locationMatch ? sanitizedLine.replace(locationMatch[0], '') : sanitizedLine;
	const locationParts = extractLocation(locationMatch ? locationMatch[1] : sanitizedLine);
	const functionName = (locationMatch && sanitizedLine) || undefined;
	const fileName = ['eval', '<anonymous>', '(native)'].includes(locationParts[0])
		? undefined
		: locationParts[0];
	return {
		functionName,
		fileName,
		lineNumber: locationParts[1] ? +locationParts[1] : undefined,
		columnNumber: locationParts[2] ? +locationParts[2] : undefined,
		source: currentLine,
	};
};

const parseSafariLine = (line: string): StackFrame => {
	let currentLine = line;
	if (currentLine.includes(' > eval'))
		currentLine = currentLine.replace(/ line (\d+)(?: > eval line \d+)* > eval:\d+:\d+/g, ':$1');
	if (!currentLine.includes('@') && !currentLine.includes(':')) {
		return { functionName: currentLine };
	}
	const functionNameRegex =
		/(([^\n\r"\u2028\u2029]*".[^\n\r"\u2028\u2029]*"[^\n\r@\u2028\u2029]*(?:@[^\n\r"\u2028\u2029]*"[^\n\r@\u2028\u2029]*)*(?:[\n\r\u2028\u2029][^@]*)?)?[^@]*)@/;
	const matches = currentLine.match(functionNameRegex);
	const functionName = matches && matches[1] ? matches[1] : undefined;
	const locationParts = extractLocation(currentLine.replace(functionNameRegex, ''));
	return {
		functionName,
		fileName: locationParts[0],
		lineNumber: locationParts[1] ? +locationParts[1] : undefined,
		columnNumber: locationParts[2] ? +locationParts[2] : undefined,
		source: currentLine,
	};
};

const parseLines = (stack: string, isV8: boolean): StackFrame[] => {
	const frames: StackFrame[] = [];
	for (const line of stack.split('\n')) {
		if (isV8 ? !CHROME_IE_STACK_REGEXP.test(line) : SAFARI_NATIVE_CODE_REGEXP.test(line)) continue;
		frames.push(isV8 ? parseV8Line(line) : parseSafariLine(line));
	}
	return frames;
};

export const parseStack = (stackString: string, options?: ParseOptions): StackFrame[] => {
	if (options?.includeInElement !== false) {
		const lines = stackString.split('\n');
		const frames: StackFrame[] = [];
		for (const rawLine of lines) {
			if (/^\s*at\s+/.test(rawLine)) {
				if (CHROME_IE_STACK_REGEXP.test(rawLine)) frames.push(parseV8Line(rawLine));
			} else if (/^\s*in\s+/.test(rawLine)) {
				const elementName = rawLine
					.replace(/^\s*in\s+/, '')
					.replace(/\s*(?:\(at .*\)|\[[^\]]+\])$/, '');
				frames.push({ functionName: elementName, source: rawLine });
			} else if (rawLine.match(FIREFOX_SAFARI_STACK_REGEXP)) {
				if (!SAFARI_NATIVE_CODE_REGEXP.test(rawLine)) frames.push(parseSafariLine(rawLine));
			}
		}
		return frames;
	}
	if (stackString.match(CHROME_IE_STACK_REGEXP)) {
		return parseLines(stackString, true);
	}
	return parseLines(stackString, false);
};

export const formatOwnerStack = (stack: string): string => {
	let formattedStack = stack;
	if (!formattedStack) {
		return '';
	}
	if (formattedStack.startsWith('Error: react-stack-top-frame\n')) {
		formattedStack = formattedStack.slice(29);
	}
	const firstNewlineIndex = formattedStack.indexOf('\n');
	if (firstNewlineIndex !== -1) {
		formattedStack = formattedStack.slice(firstNewlineIndex + 1);
	}
	let bottomFrameIndex = Math.max(
		...REACT_STACK_BOTTOM_FRAME_PATTERNS.map((pattern) => formattedStack.indexOf(pattern)),
	);
	if (bottomFrameIndex !== -1) {
		bottomFrameIndex = formattedStack.lastIndexOf('\n', bottomFrameIndex);
	}
	if (bottomFrameIndex !== -1) {
		formattedStack = formattedStack.slice(0, bottomFrameIndex);
	} else {
		return '';
	}
	return formattedStack;
};

export const hasDebugStack = (
	fiber: Fiber,
): fiber is Fiber & { _debugStack: Error & { stack: string } } =>
	fiber._debugStack instanceof Error && typeof fiber._debugStack.stack === 'string';

const displayNameOf = (body: unknown): string | null => {
	if (typeof body === 'function') {
		const fn = body as { displayName?: string; name?: string };
		return fn.displayName ?? (fn.name !== undefined && fn.name !== '' ? fn.name : null);
	}
	return null;
};

/**
 * Octane equivalent of bippy's owner stack: the scope's component ancestry.
 * Octane has no separate JSX-owner concept, so the chain is the render-tree
 * ancestry — each frame's location is the usage site the parent recorded for
 * the child's slot (`parent.locs[key]` in `parent.locFile`).
 */
// Upstream's extra args control bundle/source-map fetches; Octane resolves
// compile-time locations directly, so they are accepted and ignored.
export const getOwnerStack = async (
	fiber: ScopedFiber,
	_includeInElement?: boolean,
	_sourceFetch?: (url: string) => Promise<Response>,
): Promise<StackFrame[]> => {
	const hook = getOctaneDevtoolsHook();
	const frames: StackFrame[] = [];
	if (hook === null) return frames;
	const seen = new Set<object>();
	let current: ScopedFiber | null = fiber.return ?? null;
	while (current !== null) {
		const scope = current.scope;
		if (scope === null || scope === undefined || seen.has(scope)) break;
		seen.add(scope);
		const functionName = displayNameOf(scope.body);
		if (functionName !== null) {
			const usageSite = scopeUsageSite(hook, scope);
			frames.push({
				functionName,
				fileName: usageSite?.fileName,
				lineNumber: usageSite?.lineNumber,
				columnNumber: usageSite?.columnNumber,
			});
		}
		current = current.return;
	}
	return frames;
};

/**
 * The scope's JSX usage site (parent slot location), falling back to the
 * component body's stamped definition site. Mirrors bippy's getSource contract:
 * dev-only, `null` when no location is recorded.
 */
export const getSource = async (
	fiber: ScopedFiber,
	_includeInElement?: boolean,
	_sourceFetch?: (url: string) => Promise<Response>,
): Promise<FiberSource | null> => {
	const hook = getOctaneDevtoolsHook();
	if (hook === null) return null;
	const scope = fiber.scope;
	if (scope === null || scope === undefined) return null;
	const usageSite = scopeUsageSite(hook, scope);
	if (usageSite !== null) {
		return {
			fileName: usageSite.fileName,
			lineNumber: usageSite.lineNumber,
			columnNumber: usageSite.columnNumber,
			functionName: displayNameOf(scope.body) ?? undefined,
		};
	}
	const definitionSite = scopeDefinitionSite(scope);
	if (definitionSite !== null) {
		return {
			fileName: definitionSite.fileName,
			lineNumber: definitionSite.lineNumber,
			columnNumber: definitionSite.columnNumber,
			functionName: displayNameOf(scope.body) ?? undefined,
		};
	}
	return null;
};
