/**
 * Render writes no committed DOM (#2043). A root render computes; its commit
 * writes. This lint finds every native DOM write in the client runtime (an
 * assignment to, or a mutating call on, a member declared by the DOM lib) and
 * requires its enclosing function to be a classified writer below. TypeScript's
 * DOM declarations classify members; casts and traceable local aliases keep
 * their receiver type. It is not whole-program escape analysis: a writer is
 * classified by what it writes (see WRITERS), and the structure-commit and
 * ViewTransition suites check the render/commit split at runtime.
 *
 * A 'fresh' writer may write a node it made, a fragment, or a node its caller
 * passed. One that reaches its target through runtime structure (a Block's
 * parentNode, a slot's markers) can reach committed DOM, so its function must
 * test for a frontier first (GUARD); UNGUARDED_FRESH lists the writers still
 * to fix.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importNativeTypeScript } from './octane-tsc/native.mjs';
import { is, NodeFlags, ScriptTarget, SyntaxKind } from './octane-tsc/native-syntax.mjs';
import { UNGUARDED_FRESH, WRITERS } from './render-writers.mjs';

const { API, ModuleKind, ModuleResolutionKind, TypeFlags } =
	await importNativeTypeScript('unstable/sync');

const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const runtimeFile = path.join(ROOT, 'packages/octane/src/runtime.ts');

// Native methods that change a node, its attributes, its text, its style or
// its class list. Everything else a native receiver offers is a read.
const MUTATORS = new Set(
	`appendChild insertBefore removeChild replaceChild remove append prepend before after
 replaceWith replaceChildren moveBefore normalize splitText appendData insertData deleteData
 replaceData setAttribute setAttributeNS removeAttribute removeAttributeNS toggleAttribute
 setAttributeNode removeAttributeNode insertAdjacentElement insertAdjacentHTML insertAdjacentText
 setProperty removeProperty add toggle replace setRangeText setSelectionRange select focus blur
 click showModal show close showPopover hidePopover togglePopover requestSubmit reset submit
 setCustomValidity scrollTo scrollBy scrollIntoView`.split(/\s+/),
);

// Calls that make a node, so a fresh writer may write into what they return.
const CREATES =
	/^(?:document\.|[\w$]+\.ownerDocument!?\.|[\w$]+\.)?(?:create(?:Element|ElementNS|Comment|TextNode|DocumentFragment)|cloneNode|importNode|slotFrontier|queueFrontier)\b|^(?:slotFrontier|queueFrontier|clone|fragmentTemplate|parseTemplate)\(/;
// A fresh writer that writes a node it did not make first asks whether the
// render could reach committed DOM there.
const GUARD =
	/\b(?:usesFrontier|slotFrontier|queueFrontier|pendingWrites|ROOT_RENDER_TRANSACTION)\b/;

function unwrap(node) {
	while (
		is.isAsExpression(node) ||
		is.isTypeAssertion(node) ||
		is.isParenthesizedExpression(node) ||
		is.isNonNullExpression(node)
	)
		node = node.expression;
	return node;
}

function ownerFunction(node) {
	for (let current = node.parent; current !== undefined; current = current.parent)
		if ((is.isFunctionDeclaration(current) || is.isMethodDeclaration(current)) && current.name)
			return current;
	return undefined;
}

function owner(node) {
	for (let current = node.parent; current !== undefined; current = current.parent) {
		if (is.isFunctionDeclaration(current) && current.name)
			return is.isSourceFile(current.parent) ? current.name.text : `<nested>.${current.name.text}`;
		if (is.isMethodDeclaration(current) && current.name) {
			const parent = current.parent;
			const name = `${parent.name?.text ?? '<class>'}.${current.name.getText()}`;
			return is.isClassDeclaration(parent) && is.isSourceFile(parent.parent)
				? name
				: `<nested>.${name}`;
		}
	}
	return '<top-level>';
}

export function inspectRenderWrites(
	text,
	file = runtimeFile,
	writers = WRITERS,
	unguarded = UNGUARDED_FRESH,
) {
	// TypeScript 7 runs in its own process: `text` reaches it through the API's
	// file system callbacks.
	const api = new API({
		cwd: process.cwd(),
		...(text === undefined
			? {}
			: {
					fs: {
						readFile: (name) => (path.resolve(name) === path.resolve(file) ? text : undefined),
					},
				}),
	});
	try {
		return inspectProgram(
			api.createProgram([file], {
				target: ScriptTarget.ESNext,
				module: ModuleKind.ESNext,
				moduleResolution: ModuleResolutionKind.Bundler,
				strict: true,
				skipLibCheck: true,
				// Every visible @types package, as TypeScript 5.9 included by default.
				types: ['*'],
			}),
			file,
			writers,
			unguarded,
		);
	} finally {
		api.close();
	}
}

function inspectProgram(program, file, writers, unguarded) {
	const { checker } = program.getProject();
	const source = program.getSourceFile(file);
	if (!source) throw new Error(`Cannot read ${file}`);
	const writes = [];
	// Declarations are handles that name their file without resolving the node.
	const fromDOM = (symbol) =>
		symbol?.declarations?.some((entry) => /\/lib\.dom(?:\.iterable)?\.d\.ts$/.test(entry.path));
	const initializer = (node) =>
		is.isIdentifier(node)
			? checker.getSymbolAtLocation(node)?.valueDeclaration?.resolve()?.initializer
			: undefined;
	function literalKey(expression) {
		const node = unwrap(expression);
		if (is.isStringLiteralLikeNode(node)) return node.text;
		if (!is.isIdentifier(node)) return null;
		const declaration = checker.getSymbolAtLocation(node)?.valueDeclaration?.resolve();
		if (
			!declaration ||
			!is.isVariableDeclaration(declaration) ||
			!is.isVariableDeclarationList(declaration.parent) ||
			!(declaration.parent.flags & NodeFlags.Const) ||
			!declaration.initializer
		)
			return null;
		const value = unwrap(declaration.initializer);
		return is.isStringLiteralLikeNode(value) ? value.text : null;
	}
	// A member the DOM lib declares on a node, or on a node's style or class
	// list, through casts and aliases. Events, ports and the like are not
	// document state.
	function documentType(type) {
		return (
			fromDOM(type.getProperty('nodeType')) ||
			fromDOM(type.getProperty('cssText')) ||
			(fromDOM(type.getProperty('toggle')) && fromDOM(type.getProperty('supports')))
		);
	}
	function nativeProperty(expression, key, depth = 0) {
		if (depth > 12) return false;
		const type = checker.getNonNullableType(checker.getTypeAtLocation(expression));
		if (documentType(type) && fromDOM(type.getProperty(key))) return true;
		const raw = unwrap(expression);
		if (raw !== expression) return nativeProperty(raw, key, depth + 1);
		const initial = initializer(raw);
		return initial !== undefined && nativeProperty(initial, key, depth + 1);
	}
	function operation(access) {
		let node = access;
		while (is.isParenthesizedExpression(node.parent)) node = node.parent;
		const parent = node.parent;
		if (is.isCallExpression(parent) && parent.expression === node) return 'call';
		if (
			is.isDeleteExpression(parent) ||
			((is.isPrefixUnaryExpression(parent) || is.isPostfixUnaryExpression(parent)) &&
				(parent.operator === SyntaxKind.PlusPlusToken ||
					parent.operator === SyntaxKind.MinusMinusToken))
		)
			return 'write';
		if (
			is.isBinaryExpression(parent) &&
			parent.left === node &&
			parent.operatorToken.kind >= SyntaxKind.FirstAssignment &&
			parent.operatorToken.kind <= SyntaxKind.LastAssignment
		)
			return 'write';
		return 'read';
	}
	// Where a write's receiver comes from: a node this function made, a fragment,
	// a parameter (its caller chose it), or a node it read from runtime
	// structure (a Block's parentNode, a slot's end marker), which may be
	// committed DOM. A node's style or class list is that node's.
	function receiver(expression, depth = 0) {
		const node = unwrap(expression);
		if (depth > 8) return 'derived';
		const type = checker.getNonNullableType(checker.getTypeAtLocation(node));
		if (type.symbol?.name === 'DocumentFragment') return 'fragment';
		if (is.isPropertyAccessExpression(node))
			return node.name.text === 'style' || node.name.text === 'classList'
				? receiver(node.expression, depth + 1)
				: 'derived';
		if (is.isCallExpression(node))
			return CREATES.test(node.getText(source)) ? 'created' : 'derived';
		if (!is.isIdentifier(node)) return 'derived';
		const declaration = checker.getSymbolAtLocation(node)?.valueDeclaration?.resolve();
		if (declaration === undefined) return 'derived';
		if (is.isParameterDeclaration(declaration)) return 'param';
		const initial = declaration.initializer;
		return initial === undefined ? 'derived' : receiver(initial, depth + 1);
	}
	function visit(node) {
		if (is.isPropertyAccessExpression(node) || is.isElementAccessExpression(node)) {
			const argumentType = is.isElementAccessExpression(node)
				? checker.getTypeAtLocation(node.argumentExpression)
				: undefined;
			const key = is.isPropertyAccessExpression(node)
				? node.name.text
				: literalKey(node.argumentExpression);
			// Renderer-owned symbols and expandos aren't native writes.
			const symbolKey = argumentType && (argumentType.flags & TypeFlags.ESSymbolLike) !== 0;
			if (key !== null && !symbolKey && nativeProperty(node.expression, key)) {
				const kind = operation(node);
				if (kind === 'write' || (kind === 'call' && MUTATORS.has(key))) {
					const position = source.getLineAndCharacterOfPosition(node.getStart(source));
					writes.push({
						line: position.line + 1,
						column: position.character + 1,
						owner: owner(node),
						operation: `${kind}:${key}`,
						expression: node.getText(source),
						receiver: receiver(node.expression),
						guarded: GUARD.test(ownerFunction(node)?.getText(source) ?? ''),
					});
				}
			}
		}
		node.forEachChild(visit);
	}
	visit(source);
	const reaching = writes.filter(
		(write) =>
			writers.get(write.owner) === 'fresh' && write.receiver === 'derived' && !write.guarded,
	);
	const failures = writes.filter((write) => !writers.has(write.owner));
	for (const write of reaching)
		if (!unguarded.has(write.owner)) failures.push({ ...write, unguarded: true });
	const writing = new Set(writes.map((write) => write.owner));
	const reached = new Set(reaching.map((write) => write.owner));
	const stale = [
		...[...writers.keys()].filter((name) => !writing.has(name)),
		...[...unguarded.keys()].filter((name) => !reached.has(name)),
	];
	return { writes, failures, stale };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const { writes, failures, stale } = inspectRenderWrites();
	if (process.argv.includes('--list')) {
		const owners = new Map();
		for (const write of writes) {
			const list = owners.get(write.owner) ?? [];
			list.push(write.operation);
			owners.set(write.owner, list);
		}
		for (const [name, operations] of owners)
			console.log(`${name}\t${[...new Set(operations)].join(' ')}`);
	} else {
		for (const finding of failures)
			console.error(
				`${path.relative(ROOT, runtimeFile)}:${finding.line}:${finding.column} ${finding.owner}: ${finding.unguarded ? 'fresh writer reaches runtime structure without a frontier test:' : 'unclassified'} DOM ${finding.operation} (${finding.expression})`,
			);
		for (const name of stale)
			console.error(
				`scripts/render-writers.mjs: ${name} ${UNGUARDED_FRESH.has(name) ? 'no longer reaches DOM unguarded' : 'no longer writes DOM'}; remove it`,
			);
		if (failures.length !== 0 || stale.length !== 0) process.exitCode = 1;
		else
			console.log(
				`Every native DOM write in runtime.ts is in a classified writer (${WRITERS.size}).`,
			);
	}
}
