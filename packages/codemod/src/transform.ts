import { svgDataAttribute, svgLiteralRootOverride } from './path-svg.js';
import {
	forwardedProps,
	hasEval,
	literalJsxAttribute,
	nativeOutputOwner,
	returnedTextReceiver,
	renderUses,
	svgLocalReads,
} from './forwarded-props.js';
import { reactRenderer, staticReactProps } from './react-renderer.js';
import { linkedRenderState } from './linked-state.js';
import { nativeSetupHook } from './local-react-hook.js';
import {
	componentTagOrExport,
	inTypeNode,
	localUses,
	scalar,
	walkLocalValues,
} from './local-uses.js';
import { isWrapper, skipWrappers } from './expression-wrappers.js';
import ts from 'typescript';
import {
	effectHelpers,
	effectReceivers,
	fixedBinding,
	initializedBefore,
	stableExportedProp,
} from './effect-receivers.js';
import { isBareSvgTag, storeHookUses } from './store-hook-uses.js';
import { intlImports } from './react-intl.js';
import {
	DEPENDENCY_HOOKS,
	RADIX_TYPES,
	REACT_MODULES,
	TEXT_FIELD_COMPONENTS,
	TEXT_INPUT_TYPES,
	UNSUPPORTED_VALUES,
	mapPackageExport,
	mapQualifiedType,
	mapReactImport,
	missingExport,
	radixNamespace,
} from './mappings.js';

import type { Note, TransformOptions, TransformResult, Unported } from './types.js';

type Context = { template: boolean; descriptor?: boolean };
type Import = {
	module: string;
	local: string;
	imported: string;
	namespace: boolean;
	typeOnly: boolean;
	port: Unported | null;
};
const RADIX_SLOT_MEMBERS = new Map([
	['Root', 'Slot'],
	['Slot', 'Slot'],
	['Slottable', 'Slottable'],
]);

function directMember(receiver: ts.Node) {
	const parent = receiver.parent;
	if (
		ts.isPropertyAccessExpression(parent) &&
		parent.expression === receiver &&
		!parent.questionDotToken
	)
		return parent.name;
	if (ts.isQualifiedName(parent) && parent.left === receiver) return parent.right;
	return null;
}

type Severity = Note['severity'];
type ModuleExports = TransformResult['exports'];

/** Marks emitted text whose whole line should go. */
const DROP = '\u0000DROP\u0000';
/**
 * Stands in for a newline inside a string or template literal while arms are
 * re-indented, so moving a literal never changes its value.
 */
const LITERAL_NEWLINE = '\u0000NL\u0000';

const TEMPLATE = { template: true };
const PLAIN = { template: false };
const DESCRIPTOR = { template: false, descriptor: true };
/** The local component that wraps an element no island can host and throws its `error`. */
const NO_PORT = 'NoOctanePort';
const INTL_FORMATTER = /^Formatted[A-Z]/;
const syntheticEventMembers = {
	nativeEvent: 'unknown',
	persist: '() => void',
	isDefaultPrevented: '() => boolean',
	isPropagationStopped: '() => boolean',
};

export const MAP_PARAMETER_TDZ = 'map-parameter-tdz';
export const MAP_PARAMETER_WRITE = 'map-parameter-write';

/** Rule names, as reported. */
const RULE = {
	binding: 'bindings',
	classComponent: 'class-component',
	consumer: 'context-consumer',
	defaultProps: 'default-props',
	descriptorChildren: 'descriptor-children',
	elementChildren: 'element-children',
	elementChildProp: 'element-child-prop',
	deps: 'hook-dependencies',
	eventObject: 'event-object',
	forwardRef: 'forward-ref',
	import: 'imports',
	legacyRoot: 'legacy-root',
	rootRender: 'root-render',
	serverRender: 'server-render',
	flushSync: 'flush-sync',
	renderProp: 'render-prop-children',
	documentShell: 'document-shell',
	nativeChange: 'native-text-change',
	nativeSignal: 'native-signal-read',
	nativeRefState: 'native-ref-state',
	className: 'class-attribute',
	provider: 'context-provider',
	strictMode: 'strict-mode',
	component: 'template-component',
	if: 'template-if',
	for: 'template-for',
	text: 'template-text',
	try: 'template-try',
	unsupported: 'unsupported-api',
	strong: 'strong',
	bindings: 'bindings',
	reactCompat: 'react-compat',
};

/**
 * Rewrite one React module as Octane.
 */
export function transformModule(
	source: string,
	filename: string,
	options: TransformOptions = {},
): TransformResult {
	return new ModuleTransform(source, filename, options).run();
}

export function projectTypeAt(node: ts.Node, types: TransformOptions['types']) {
	if (types?.sourceFile.text !== node.getSourceFile().text) return null;
	const peer = nodeSpanning(types.sourceFile, node.getStart(), node.end);
	// A shorthand and its identifier occupy the same span. Use the declared
	// prop contract when the binding stays stable and local code cannot supply it.
	if (
		peer &&
		ts.isShorthandPropertyAssignment(peer) &&
		ts.isIdentifier(node) &&
		ts.isShorthandPropertyAssignment(node.parent) &&
		node.parent.name === node
	) {
		const { sourceFile, checker } = types;
		const symbol = checker.getShorthandAssignmentValueSymbol(peer);
		const type = checker.getTypeAtLocation(peer.name);
		if (
			!scalar(type) ||
			!stableExportedProp(symbol, checker) ||
			((sourceFile.text.includes('eval') || sourceFile.text.includes('\\u')) && hasEval(sourceFile))
		)
			return null;
		return { type, checker };
	}
	if (peer?.kind !== node.kind) return null;
	return { type: types.checker.getTypeAtLocation(peer), checker: types.checker };
}

/**
 * Parse and bind one module on its own, with only the ES5 library and no
 * module resolution. Binding is enough to map every name to the declaration it
 * refers to, so a shadowed `useState` or event parameter is never mistaken for
 * another; the library gives the module's own types their array and string
 * members.
 */
export function bind(filename: string, source: string) {
	const lib = esLib();
	const sf = ts.createSourceFile(
		filename,
		source,
		ts.ScriptTarget.Latest,
		true,
		scriptKind(filename),
	);
	const host: ts.CompilerHost = {
		getSourceFile: (name) => (name === filename ? sf : name === lib.fileName ? lib : undefined),
		getDefaultLibFileName: () => lib.fileName,
		writeFile: () => {},
		getCurrentDirectory: () => '',
		getCanonicalFileName: (name) => name,
		useCaseSensitiveFileNames: () => true,
		getNewLine: () => '\n',
		fileExists: (name) => name === filename || name === lib.fileName,
		readFile: () => undefined,
	};
	const program = ts.createProgram({
		rootNames: [filename, lib.fileName],
		options: {
			noLib: true,
			noResolve: true,
			allowJs: true,
			jsx: ts.JsxEmit.Preserve,
			types: [],
			// As the compiler's typed-text proof requires: a `string` excludes
			// null, and an indexed read may be missing.
			strictNullChecks: true,
			noUncheckedIndexedAccess: true,
		},
		host,
	});
	return { sf, checker: program.getTypeChecker() };
}

const ES5_LIB_PATH = ts.getDefaultLibFilePath({}).replace(/[^/\\]+$/, 'lib.es5.d.ts');
let es5: ts.SourceFile | undefined;

/**
 * The ES5 library, parsed once and shared by every module's program, so
 * array and string members have types.
 */
function esLib() {
	es5 ??= ts.createSourceFile(
		'lib.es5.d.ts',
		ts.sys.readFile(ES5_LIB_PATH) as string,
		ts.ScriptTarget.Latest,
		true,
	);
	return es5;
}

let domTagNames: Set<string> | undefined;

/** The DOM library distinguishes built-in elements from project-specific JSX intrinsics. */
function isDOMTag(tag: string) {
	if (!domTagNames) {
		const file = ts.getDefaultLibFilePath({}).replace(/[^/\\]+$/, 'lib.dom.d.ts');
		const dom = ts.createSourceFile(file, ts.sys.readFile(file) ?? '', ts.ScriptTarget.Latest);
		domTagNames = new Set();
		for (const declaration of dom.statements) {
			if (!ts.isInterfaceDeclaration(declaration) || !declaration.name.text.endsWith('TagNameMap'))
				continue;
			for (const member of declaration.members) {
				if (member.name && ts.isStringLiteral(member.name)) domTagNames.add(member.name.text);
			}
		}
	}
	return domTagNames.has(tag);
}

function scriptKind(filename: string) {
	if (filename.endsWith('.tsx')) return ts.ScriptKind.TSX;
	if (filename.endsWith('.jsx')) return ts.ScriptKind.JSX;
	if (/\.[cm]?ts$/.test(filename)) return ts.ScriptKind.TS;
	// Plain .js files often hold JSX in React projects.
	return ts.ScriptKind.JSX;
}

export function nativeReactCompat(module: string, name: string) {
	return (
		(name === 'ReactCompat' || name === 'ReactCompatInline') &&
		(module === 'octane/react' || module === 'octane/react/server')
	);
}

function skipParens(node: ts.Expression): ts.Expression {
	while (ts.isParenthesizedExpression(node)) node = node.expression;
	return node;
}

/**
 * The declaration as a rest binding, `rest` in `{ a, ...rest }`, or null.
 */
function asRest(declaration: ts.Declaration | null) {
	return declaration &&
		ts.isBindingElement(declaration) &&
		declaration.dotDotDotToken &&
		ts.isObjectBindingPattern(declaration.parent)
		? declaration
		: null;
}

function isJsx(node: ts.Node) {
	return ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node);
}

/** A deferred clsx call may test a binding only if its truth value stays fixed. */
function svgClassToken(
	expr: ts.Expression,
	fixedToken: (name: ts.Identifier, truthTest: boolean) => boolean,
	truthTest = false,
): boolean {
	expr = skipWrappers(expr);
	if (ts.isStringLiteralLike(expr)) return true;
	if (ts.isIdentifier(expr)) return fixedToken(expr, truthTest);
	if (ts.isPrefixUnaryExpression(expr) && expr.operator === ts.SyntaxKind.ExclamationToken)
		return svgClassToken(expr.operand, fixedToken, true);
	if (ts.isConditionalExpression(expr))
		return (
			svgClassToken(expr.condition, fixedToken, true) &&
			svgClassToken(expr.whenTrue, fixedToken, truthTest) &&
			svgClassToken(expr.whenFalse, fixedToken, truthTest)
		);
	if (ts.isBinaryExpression(expr)) {
		const op = expr.operatorToken.kind;
		if (op === ts.SyntaxKind.AmpersandAmpersandToken || op === ts.SyntaxKind.BarBarToken)
			return (
				svgClassToken(
					expr.left,
					fixedToken,
					truthTest || op === ts.SyntaxKind.AmpersandAmpersandToken,
				) && svgClassToken(expr.right, fixedToken, truthTest)
			);
	}
	return false;
}

// A renderer can evaluate a child prop later than React. Keep the class map private
// to reads of individual tokens, including through another import of the same sheet.
function readsCssToken(ref: ts.Identifier) {
	const member = ref.parent;
	if (
		!ts.isPropertyAccessExpression(member) ||
		member.expression !== ref ||
		!ts.isIdentifier(member.name) ||
		Object.hasOwn(Object.prototype, member.name.text)
	)
		return false;
	let value: ts.Expression = member;
	while (isWrapper(value.parent) && value.parent.expression === value) value = value.parent;
	const use = value.parent;
	return (
		ts.isJsxExpression(use) ||
		(ts.isCallExpression(use) && use.arguments.includes(value)) ||
		(ts.isVariableDeclaration(use) && use.initializer === value) ||
		ts.isConditionalExpression(use) ||
		(ts.isPrefixUnaryExpression(use) && use.operator === ts.SyntaxKind.ExclamationToken) ||
		(ts.isBinaryExpression(use) &&
			(use.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
				use.operatorToken.kind === ts.SyntaxKind.BarBarToken))
	);
}

/**
 * What a module's import of a package with no Octane port leaves to do.
 */
function portComment({ name, islands, blocked }: Unported) {
	const missing = `No Octane port of \`${name}\` exists`;
	if (blocked > 0) {
		return `${missing}, and this module needs one: Octane cannot call its hooks, read its contexts, or pass Octane content to its components.`;
	}
	return islands > 0
		? `${missing}, so its components render in React through ReactCompat.`
		: `${missing}; React stays a dependency for it.`;
}

/**
 * Whether a hole is already spelled as text, or as a literal the cast would
 * only clutter.
 */
function isTextSpelling(node: ts.Expression) {
	node = skipParens(node);
	return (
		ts.isNumericLiteral(node) ||
		ts.isBigIntLiteral(node) ||
		ts.isAsExpression(node) ||
		isStringSpelling(node)
	);
}

/**
 * Whether the compiler proves `node` a string by its spelling: a string
 * literal, a `String()` call, or a concatenation with one.
 */
function isStringSpelling(node: ts.Expression): boolean {
	node = skipParens(node);
	if (ts.isStringLiteral(node) || ts.isTemplateLiteral(node)) return true;
	if (ts.isCallExpression(node)) {
		return ts.isIdentifier(node.expression) && node.expression.text === 'String';
	}
	return (
		ts.isBinaryExpression(node) &&
		node.operatorToken.kind === ts.SyntaxKind.PlusToken &&
		(isStringSpelling(node.left) || isStringSpelling(node.right))
	);
}

/**
 * What a type renders as: 1 when every member is a string, 2 when every
 * member is a string, number, or bigint and one is not a string, else 0. The
 * compiler's typed-text proof applies the same test.
 */
export function textKind(type: ts.Type): 0 | 1 | 2 {
	const { TypeFlags } = ts;
	const opaque =
		TypeFlags.Any | TypeFlags.Unknown | TypeFlags.Never | TypeFlags.VoidLike | TypeFlags.Null;
	if (type.flags & opaque) return 0;
	if (type.flags & TypeFlags.StringLike) return 1;
	if (type.flags & (TypeFlags.NumberLike | TypeFlags.BigIntLike)) return 2;
	if (!type.isUnion()) return 0;
	let kind: 0 | 1 | 2 = 1;
	for (const member of type.types) {
		const each = textKind(member);
		if (each === 0) return 0;
		if (each === 2) kind = 2;
	}
	return kind;
}

/** Every possible falsy value is one React skips, so a JSX guard can be an `@if`. */
function isBooleanGuardType(type: ts.Type): boolean {
	if (type.isUnion()) return type.types.every(isBooleanGuardType);
	return (
		(type.flags & (ts.TypeFlags.BooleanLike | ts.TypeFlags.Null | ts.TypeFlags.Undefined)) !== 0
	);
}

/**
 * The outermost node of `sf` spanning exactly `[start, end)`.
 */
function nodeSpanning(sf: ts.SourceFile, start: number, end: number): ts.Node | null {
	let node: ts.Node = sf;
	for (;;) {
		const child = ts.forEachChild(node, (c) => (c.pos <= start && c.end >= end ? c : undefined));
		if (!child) return null;
		if (child.getStart(sf) === start && child.end === end) return child;
		node = child;
	}
}

function rowKeyLiteral(node: ts.Expression) {
	node = skipWrappers(node);
	if (ts.isPrefixUnaryExpression(node)) {
		const operand = skipWrappers(node.operand);
		if (node.operator === ts.SyntaxKind.PlusToken) return ts.isNumericLiteral(operand);
		return (
			node.operator === ts.SyntaxKind.MinusToken &&
			(ts.isNumericLiteral(operand) || ts.isBigIntLiteral(operand))
		);
	}
	return (
		ts.isStringLiteralLike(node) ||
		ts.isNumericLiteral(node) ||
		ts.isBigIntLiteral(node) ||
		node.kind === ts.SyntaxKind.TrueKeyword ||
		node.kind === ts.SyntaxKind.FalseKeyword ||
		node.kind === ts.SyntaxKind.NullKeyword
	);
}

/**
 * The attribute an element sets by `name`.
 */
function attributeOf(element: ts.JsxOpeningLikeElement, name: string) {
	return element.attributes.properties.find(
		(a): a is ts.JsxAttribute =>
			ts.isJsxAttribute(a) && ts.isIdentifier(a.name) && a.name.text === name,
	);
}

/** Find a key on a row or one of its conditional arms. */
function rowKey(node: ts.Expression): ts.JsxAttribute | undefined {
	node = skipParens(node);
	if (ts.isConditionalExpression(node)) return rowKey(node.whenTrue) ?? rowKey(node.whenFalse);
	if (ts.isJsxElement(node)) return attributeOf(node.openingElement, 'key');
	if (ts.isJsxSelfClosingElement(node)) return attributeOf(node, 'key');
}

/**
 * The element an `if (c) return <A />;` guard returns, or null for any other
 * statement.
 */
function guardReturn(statement: ts.Statement): ts.Expression | null {
	if (!ts.isIfStatement(statement) || statement.elseStatement) return null;
	let then = statement.thenStatement;
	if (ts.isBlock(then)) {
		if (then.statements.length !== 1) return null;
		then = then.statements[0];
	}
	if (!ts.isReturnStatement(then) || !then.expression) return null;
	return isJsx(skipParens(then.expression)) ? then.expression : null;
}

function hasJsx(node: ts.Node): boolean {
	return isJsx(node) || (ts.forEachChild(node, hasJsx) ?? false);
}

/**
 * Whether any `return` in `statements`, outside nested functions, returns
 * JSX.
 */
function returnsJsx(statements: readonly ts.Statement[]) {
	const visit: (node: ts.Node) => boolean = (node) => {
		if (isFunctionLike(node)) return false;
		if (ts.isReturnStatement(node) && node.expression && hasJsx(node.expression)) return true;
		return ts.forEachChild(node, visit) ?? false;
	};
	return statements.some(visit);
}

/** Document tags a router shell renders through `@octanejs/tanstack-router`. */
const DOCUMENT_TAGS: Record<string, string> = {
	html: 'Html',
	head: 'Head',
	body: 'Body',
};

function isNullish(node: ts.Node) {
	return (
		node.kind === ts.SyntaxKind.NullKeyword ||
		node.kind === ts.SyntaxKind.FalseKeyword ||
		(ts.isIdentifier(node) && node.text === 'undefined')
	);
}

function isFunctionLike(node: ts.Node) {
	return (
		ts.isFunctionDeclaration(node) ||
		ts.isFunctionExpression(node) ||
		ts.isArrowFunction(node) ||
		ts.isMethodDeclaration(node) ||
		ts.isGetAccessor(node) ||
		ts.isSetAccessor(node) ||
		ts.isConstructorDeclaration(node)
	);
}

/**
 * Modules whose exports the codemod knows by name: React's, and Octane's own
 * for code already partly migrated.
 */
function isApiModule(module: string) {
	return module in REACT_MODULES || module === 'octane';
}

/**
 * Whether an identifier names a property rather than a binding.
 */
function isPropertyName(node: ts.Identifier) {
	const parent = node.parent;
	if (ts.isPropertyAccessExpression(parent)) return parent.name === node;
	if (ts.isQualifiedName(parent)) return parent.right === node;
	return (
		'name' in parent &&
		parent.name === node &&
		(ts.isPropertyAssignment(parent) ||
			ts.isPropertySignature(parent) ||
			ts.isPropertyDeclaration(parent) ||
			ts.isMethodDeclaration(parent) ||
			ts.isMethodSignature(parent) ||
			ts.isJsxAttribute(parent))
	);
}

/**
 * Whether an identifier is the name a declaration introduces.
 */
function declaresName(node: ts.Identifier) {
	const parent = node.parent;
	if (!('name' in parent) || parent.name !== node) return false;
	return (
		ts.isVariableDeclaration(parent) ||
		ts.isFunctionDeclaration(parent) ||
		ts.isFunctionExpression(parent) ||
		ts.isClassDeclaration(parent) ||
		ts.isClassExpression(parent) ||
		ts.isParameter(parent) ||
		ts.isBindingElement(parent) ||
		ts.isImportSpecifier(parent) ||
		ts.isImportClause(parent) ||
		ts.isNamespaceImport(parent) ||
		ts.isTypeAliasDeclaration(parent) ||
		ts.isInterfaceDeclaration(parent) ||
		ts.isEnumDeclaration(parent) ||
		ts.isTypeParameterDeclaration(parent)
	);
}

/**
 * The names a binding pattern introduces.
 */
function bindingNames(name: ts.BindingName): string[] {
	if (ts.isIdentifier(name)) return [name.text];
	return name.elements.flatMap((element) =>
		ts.isOmittedExpression(element) ? [] : bindingNames(element.name),
	);
}

/**
 * Whether `node` reads a name `test` accepts.
 */
function reads(node: ts.Node, test: (name: ts.Identifier) => boolean): boolean {
	if (ts.isIdentifier(node)) return test(node);
	return ts.forEachChild(node, (child) => reads(child, test) || undefined) === true;
}

/**
 * Whether a `function` body reads its own `this` or `arguments`.
 */
function usesOwnThis(node: ts.Node): boolean {
	if (node.kind === ts.SyntaxKind.ThisKeyword) return true;
	if (ts.isIdentifier(node) && node.text === 'arguments') return true;
	if (isFunctionLike(node) && !ts.isArrowFunction(node)) return false;
	return ts.forEachChild(node, (child) => usesOwnThis(child) || undefined) === true;
}

/**
 * The children of an element that are more than layout whitespace.
 */
function contentOf(node: ts.JsxElement | ts.JsxFragment) {
	return node.children.filter(
		(child) => !(ts.isJsxText(child) && child.containsOnlyTriviaWhiteSpaces),
	);
}

/** JSX emitters agree on empty ASCII indentation; spaces on a single line are children. */
export function withoutJsxIndentation(children: readonly ts.JsxChild[]) {
	return children.filter(
		(child) => !(ts.isJsxText(child) && /^[\t ]*[\r\n][\t\r\n ]*$/.test(child.text)),
	);
}

/**
 * A comment's text without its delimiters, to wrap as a JSX comment.
 */
function commentText(comment: string) {
	const body = comment.startsWith('//') ? comment.slice(2) : comment.slice(2, -2);
	return body.trim().replaceAll('*/', '* /');
}

const SIGNAL_MODULES = new Set([
	'octane/signals',
	'octane/signals/client',
	'octane/signals/server',
]);

function isComponentName(name: string) {
	return /^[A-Z]/.test(name);
}

class ModuleTransform {
	readonly source: string;
	readonly filename: string;
	private reactEventParameters?: Set<ts.ParameterDeclaration>;
	readonly options: TransformOptions;
	readonly target: 'tsrx' | 'tsx';
	readonly strong: boolean;
	readonly effectAliases?: Map<ts.Expression, string>;
	readonly effectSnapshots?: Map<ts.ExpressionStatement, string[]>;
	private effectEdits?: Map<ts.Node, string>;
	private snapshotCaptures?: Map<ts.ArrowFunction, string[]>;
	private effectHelperCaptures?: Map<ts.ArrowFunction, ts.VariableStatement[]>;
	private linkedStateEdits?: Map<ts.Statement, string>;
	private nativeRefStoreFactory?: string;
	private linkedStateNames?: [string, string, string, string];
	/** React imports read as values, not only as types. */
	readonly valueUses = new Set<string>();
	hasSignalRuntime?: boolean;
	routerShell = false;
	readonly strictTypes: boolean;
	readonly sf: ts.SourceFile;
	readonly checker: ts.TypeChecker;
	readonly notes: Note[] = [];
	readonly rules: Record<string, number> = {};
	template = false;
	readonly indentUnit: string;
	/** Every import, keyed by its declaration. */
	readonly imports = new Map<ts.Node, Import>();
	radixSlotMembers?: Map<ts.MemberName, { replacement?: string; name: string }>;
	radixSlotImports?: Map<ts.Identifier, 'original' | 'native'>;
	nativeIntl = new Set<ts.ImportSpecifier>();
	hasReactBridge = false;
	readonly pathSvgImports = new Map<ts.ImportDeclaration, string>();
	readonly nativeStoreHooks = new Map<ts.ImportSpecifier, { from: string; name: string }>();
	/** React and Octane imports, by local name. */
	readonly apiLocals = new Map<string, Import>();
	/** React-module locals that are still referenced after the rewrite. */
	readonly used = new Set<string>();
	/** Imports the rewrite needs from Octane: module -> name -> { local, typeOnly } */
	readonly added = new Map<string, Map<string, { local: string; typeOnly: boolean }>>();
	/** Every name the module declares, to keep added imports from colliding. */
	readonly declared = new Set<string>();
	/** Attributes a parent rule has already consumed, such as a row key. */
	readonly removed = new Set<ts.JsxAttributeLike>();
	/** `<Fragment key>` rows whose key moved to the `@for` header. */
	readonly bare = new Set<ts.Node>();
	/** Functions whose parameter list a rule replaced. */
	readonly parameters = new Map<ts.Node, string>();
	/** Rest props that give up `onChange` to a text field. */
	readonly restChange = new Set<ts.BindingElement>();
	/** Spreads of those rest props, which pass it as `onInput`. */
	readonly changeSpreads = new Set<ts.JsxSpreadAttribute>();
	/** Proven element slots on converted top-level declarations, for the project caller pass. */
	readonly elementChildren: NonNullable<ModuleExports['elementChildren']> = [];
	/** Components to mark `descriptorChildren`. */
	readonly descriptorComponents = new Set<ts.VariableDeclaration | ts.FunctionDeclaration>();
	/** Whether a `declare module` now augments `octane/jsx-runtime`. */
	augments = false;
	/** Each import specifier's unported package. */
	readonly ports = new Map<string, Unported | null>();
	/** Unported packages, by name. */
	readonly unported = new Map<string, Unported>();
	/** Elements to host in a `ReactCompat` island. */
	readonly islands = new Map<
		ts.JsxElement | ts.JsxSelfClosingElement,
		'ReactCompat' | 'ReactCompatInline'
	>();
	readonly reactRendererBodies = new Map<ts.Node, string>();
	readonly originalStoreTags = new Map<ts.ImportSpecifier, string>();
	storeSourceNames?: Set<string>;
	/** Elements no island can host, with the error each throws where it renders. */
	readonly unrenderable = new Map<ts.Node, string>();
	/** Placeholder index -> import declaration. */
	readonly importSlots: ts.ImportDeclaration[] = [];
	intrinsicPropsHelper: string | null = null;
	hasJsx = false;
	/** Whether the module imports React, rather than already being Octane. */
	fromReact = false;
	/** Each specifier's new spelling, or null to keep it. */
	readonly resolved = new Map<string, string | null>();
	quote = "'";

	constructor(source: string, filename: string, options: TransformOptions) {
		this.source = source;
		this.filename = filename;
		this.options = options;
		if (options.captureEffectReceivers || options.snapshotEffectProperties)
			this.effectAliases = new Map();
		if (options.snapshotEffectProperties) this.effectSnapshots = new Map();
		this.target = options.target ?? 'tsrx';
		this.strong = options.strong === true;
		this.strictTypes = options.strictNullChecks === true && /\.[cm]?tsx?$/.test(filename);
		const { sf, checker } = bind(filename, source);
		this.sf = sf;
		this.checker = checker;
		this.indentUnit = /^\t/m.test(source) ? '\t' : '  ';
	}

	private get emitsTsrx() {
		return (
			this.template || (this.target === 'tsrx' && (this.hasJsx || /\.[jt]sx$/.test(this.filename)))
		);
	}

	run(): TransformResult {
		this.analyze();
		let code = this.emit(this.sf, PLAIN, 0);
		code = this.finishImports(code);
		code = code.replace(/^[ \t]*\u0000DROP\u0000[ \t]*\r?\n/gm, '').replaceAll(DROP, '');
		code = code.replaceAll(LITERAL_NEWLINE, '\n');
		if (this.unrenderable.size > 0) {
			const [props, result] = this.isTypeScript()
				? [': { error: string; children?: unknown }', ': never']
				: ['', ''];
			code = `${code.trimEnd()}\n\nfunction ${NO_PORT}({ error }${props})${result} {\n${this.indentUnit}throw new Error(error);\n}\n`;
		}
		if (this.nativeRefStoreFactory) {
			code = `${code.trimEnd()}

function ${this.nativeRefStoreFactory}<T>(initial: T) {
	let current = initial;
	let notify: (() => void) | null = null;
	return {
		get: () => current,
		subscribe(listener: () => void) {
			notify = listener;
			return () => { if (notify === listener) notify = null; };
		},
		attach(next: T) {
			if (current === next) return;
			current = next;
			notify?.();
		},
	};
}
`;
		}
		const tsrx = this.emitsTsrx;
		if (tsrx) code = code.replace(/^\/\*\*\s*@jsxImportSource\s+\S+\s*\*\/[ \t]*\r?\n/m, '');
		// A JavaScript module was never type-checked; as TSRX it stays unchecked.
		if (tsrx && /\.[cm]?jsx?$/.test(this.filename)) {
			code = code.replace(/^(#![^\n]*\n)?/, '$1// @ts-nocheck\n');
		}
		if (this.strong && tsrx) code = this.addStrongDirective(code);
		if (!tsrx && this.fromReact && this.hasJsx && /\.(?:[jt]sx|js)$/.test(this.filename)) {
			code = this.addJsxPragma(code);
		}
		return {
			code,
			changed: code !== this.source,
			template: tsrx,
			notes: this.notes.sort((a, b) => a.line - b.line),
			rules: this.rules,
			exports: this.exportsOf(),
			unported: [...this.unported.values()],
		};
	}

	exportsOf(): ModuleExports {
		const contexts: Set<string> = new Set();
		const exported: Set<string> = new Set();
		const reexports: ModuleExports['reexports'] = [];
		const isExported = (statement: ts.Statement) =>
			ts.canHaveModifiers(statement) &&
			ts.getModifiers(statement)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
		const descriptorChildren = [...this.descriptorComponents].flatMap((d) => {
			const statement = ts.isVariableDeclaration(d) ? d.parent.parent : d;
			return d.name && isExported(statement) ? [d.name.getText(this.sf)] : [];
		});
		for (const statement of this.sf.statements) {
			if (ts.isVariableStatement(statement)) {
				for (const declaration of statement.declarationList.declarations) {
					if (!ts.isIdentifier(declaration.name) || !this.isContext(declaration.name)) continue;
					contexts.add(declaration.name.text);
					if (isExported(statement)) exported.add(declaration.name.text);
				}
			} else if (
				ts.isExportDeclaration(statement) &&
				statement.exportClause &&
				ts.isNamedExports(statement.exportClause)
			) {
				if (statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
					const pairs = statement.exportClause.elements.map<[string, string]>((element) => [
						(element.propertyName ?? element.name).text,
						element.name.text,
					]);
					reexports.push({ specifier: statement.moduleSpecifier.text, names: pairs });
				} else {
					for (const element of statement.exportClause.elements) {
						if (contexts.has((element.propertyName ?? element.name).text))
							exported.add(element.name.text);
						if (!this.descriptorComponents.size || statement.isTypeOnly || element.isTypeOnly)
							continue;
						const local =
							this.checker.getExportSpecifierLocalTargetSymbol(element)?.valueDeclaration;
						if (
							local &&
							(ts.isFunctionDeclaration(local) || ts.isVariableDeclaration(local)) &&
							this.descriptorComponents.has(local)
						) {
							descriptorChildren.push(element.name.text);
						}
					}
				}
			} else if (
				ts.isExportDeclaration(statement) &&
				statement.moduleSpecifier &&
				ts.isStringLiteral(statement.moduleSpecifier)
			) {
				reexports.push({ specifier: statement.moduleSpecifier.text, names: null });
			} else if (ts.isExportAssignment(statement) && ts.isIdentifier(statement.expression)) {
				if (contexts.has(statement.expression.text)) exported.add('default');
			}
		}

		return {
			contexts: [...exported],
			reexports,
			...(descriptorChildren.length ? { descriptorChildren } : {}),
			...(this.elementChildren.length ? { elementChildren: this.elementChildren } : {}),
		};
	}

	// ---------------------------------------------------------------- analysis

	analyze() {
		// Added imports quote their module as the module's own imports do.
		const first = this.sf.statements.find(ts.isImportDeclaration);
		this.quote = first ? first.moduleSpecifier.getText(this.sf)[0] : "'";
		/** Locals imported from a package with no Octane port. */
		const portLocals = new Set<string>();
		const reactSvgImports = new Set<Import>();
		for (const statement of this.sf.statements) {
			if (
				ts.isExportDeclaration(statement) &&
				!statement.isTypeOnly &&
				statement.moduleSpecifier &&
				ts.isStringLiteral(statement.moduleSpecifier)
			) {
				const port = this.portOf(statement.moduleSpecifier.text);
				if (port) {
					this.note(
						RULE.bindings,
						'warning',
						statement,
						`\`${port.name}\` has no Octane port: import its components from it where they render, so they can render in a \`ReactCompat\` island.`,
					);
				}
			}
			if (!ts.isImportDeclaration(statement) || !statement.importClause) continue;
			const module = (statement.moduleSpecifier as ts.StringLiteral).text;
			if (module in REACT_MODULES) this.fromReact = true;
			if (/^@tanstack\/react-(?:router|start)(?:\/|$)/.test(module)) this.routerShell = true;
			const clause = statement.importClause;
			const record = (
				declaration: ts.Node,
				name: ts.Identifier,
				imported: string,
				typeOnly: boolean,
			) => {
				const entry = {
					module,
					local: name.text,
					imported,
					namespace: imported === '*',
					typeOnly,
					port: null,
				};
				this.imports.set(declaration, entry);
				if (
					module === 'radix-ui' &&
					(imported === 'Slot' || entry.namespace) &&
					this.resolve(module) === '@octanejs/radix'
				)
					this.planRadixSlots(name, entry.namespace);
				if (module === 'octane/react' || module === 'octane/react/server')
					this.hasReactBridge = true;
				if (
					this.target === 'tsrx' &&
					!typeOnly &&
					((imported === 'default' && module.endsWith('.svg?react')) ||
						(imported === 'ReactComponent' && module.endsWith('.svg')))
				)
					reactSvgImports.add(entry);
				if (isApiModule(module)) this.apiLocals.set(name.text, entry);
			};
			// A default import of React is the namespace in practice; any other
			// module's default import is its `default` export.
			if (clause.name) {
				record(clause, clause.name, isApiModule(module) ? '*' : 'default', clause.isTypeOnly);
			}
			const bindings = clause.namedBindings;
			if (bindings && ts.isNamespaceImport(bindings)) {
				record(bindings, bindings.name, '*', clause.isTypeOnly);
			}
			if (bindings && ts.isNamedImports(bindings)) {
				for (const element of bindings.elements) {
					const imported = (element.propertyName ?? element.name).text;
					record(element, element.name, imported, clause.isTypeOnly || element.isTypeOnly);
				}
			}
		}
		// Resolve component wrappers through their imports before claiming native Intl hooks.
		if (this.options.reactIntlAdapter && this.source.includes('react-intl')) {
			this.nativeIntl = intlImports(
				this.sf,
				this.options.forwardedText,
				this.checker,
				(expr) => this.typeOf(expr),
				(fn) => this.isComponent(fn),
				(element) => !!this.authoredIsland(element),
				(element) => this.hostsInReact(element),
				(tag) =>
					!!returnedTextReceiver(
						tag,
						{
							typeOf: (n) => this.typeOf(n),
							text: (n) => textKind(this.typeOf(n)) !== 0,
						},
						this.localUses,
					),
				() => this.options.reactStoreComponent?.('react-intl') === true,
				(call, method) => {
					if (method === 'formatMessage' || this.options.automaticReactJsx)
						this.note(
							RULE.bindings,
							'error',
							call,
							`A React Intl formatter can schedule React DOM resources on the original request. Verify this ${method} call runs without renderer-owned effects, or keep it in the original React render.`,
						);
				},
			);
		}
		let safeStoreUses: ReturnType<typeof storeHookUses> | undefined;
		const descriptors = new Map<ts.Node, { item: ts.ImportSpecifier; props: string }>();
		for (const [declaration, entry] of this.imports) {
			if (entry.typeOnly || (ts.isImportSpecifier(declaration) && this.nativeIntl.has(declaration)))
				continue;
			if (
				this.target === 'tsrx' &&
				this.options.resolveStoreHook &&
				ts.isImportSpecifier(declaration) &&
				/^use[A-Z0-9]/.test(entry.imported) &&
				/^use[A-Z0-9]/.test(entry.local)
			) {
				const statement = declaration.parent.parent.parent;
				if (!statement.attributes && !/\/\*|\/\//.test(statement.getText(this.sf))) {
					const pending: typeof descriptors = new Map();
					const from = this.options.resolveStoreHook(
						entry.module,
						entry.imported,
						(sharedInput, unchangedHelper, retainedArgument) => {
							safeStoreUses ??= storeHookUses(
								this.sf,
								this.checker,
								(fn) => this.isComponent(fn),
								(expr) => this.typeOf(expr),
							);
							pending.clear();
							return safeStoreUses(
								declaration,
								sharedInput,
								(elements) => {
									const args = elements.map((element) => this.storeReactDescriptor(element));
									if (!args.every((arg) => arg !== null)) return false;
									for (const [index, arg] of args.entries()) pending.set(elements[index], arg);
									return true;
								},
								unchangedHelper,
								retainedArgument,
							);
						},
					);
					if (from) {
						for (const [element, args] of pending) descriptors.set(element, args);
						this.nativeStoreHooks.set(declaration, from);
						continue;
					}
				}
			}
			if (nativeReactCompat(entry.module, entry.imported)) continue;
			entry.port = this.portOf(entry.module);
			if (entry.port) portLocals.add(entry.local);
		}
		for (const [element, { item, props }] of descriptors) {
			if (this.nativeIntl.has(item) && !this.originalStoreTags.has(item)) {
				if (this.localUses(item.name).every((ref) => descriptors.has(ref.parent)))
					this.nativeIntl.delete(item);
				else this.originalStoreTags.set(item, 'OriginalReact' + item.name.text);
			}
			const tag = this.originalStoreTags.get(item) ?? item.name.text;
			this.reactRendererBodies.set(element, tag + ', ' + props);
		}
		if (this.target === 'tsrx') {
			for (const item of this.nativeIntl) {
				if ((item.propertyName ?? item.name).text !== 'FormattedMessage') continue;
				for (const ref of this.localUses(item.name)) {
					const element = ref.parent;
					if (ts.isJsxSelfClosingElement(element) && !this.reactRendererBodies.has(element))
						this.reportIntlFormatterOwner(element, 'generated native adapter');
				}
			}
		}
		let hasEval = false;
		const snapshots: ts.VariableDeclaration[] = [];
		const helperCalls: ts.CallExpression[] | undefined =
			this.effectAliases && this.options.captureEffectHelpers ? [] : undefined;
		if (
			this.source.includes('SubmitEvent') ||
			this.source.includes('ReactEventHandler') ||
			this.source.includes('\\u')
		)
			this.reactEventParameters = this.indexReactEventParameters();
		const fields: ts.JsxOpeningLikeElement[] = [];
		/** Values read as an element: cloned, inspected, or a `render` prop. */
		const elements: ts.Expression[] = [];
		const visit = (node: ts.Node) => {
			if (ts.isParameter(node) && this.reactEventParameters?.has(node))
				this.checkReactEventParameter(node);
			if (ts.isIdentifier(node) && declaresName(node)) this.declared.add(node.text);
			if (
				this.options.captureEffectSnapshots &&
				ts.isVariableDeclaration(node) &&
				ts.isArrayBindingPattern(node.name) &&
				node.name.elements.length === 1
			)
				snapshots.push(node);
			if (
				(helperCalls ||
					this.options.pathSvgAdapter ||
					this.options.captureEffectSnapshots ||
					this.options.linkRenderState) &&
				ts.isIdentifier(node) &&
				node.text === 'eval'
			)
				hasEval = true;
			if (
				helperCalls &&
				ts.isCallExpression(node) &&
				node.arguments.length === 2 &&
				ts.isArrowFunction(node.arguments[0]!)
			)
				helperCalls.push(node);
			if (ts.isIdentifier(node) && portLocals.has(node.text)) this.planUnported(node);
			if (isJsx(node)) this.hasJsx = true;
			if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) fields.push(node);
			if (
				ts.isJsxAttribute(node) &&
				node.name.getText(this.sf) === 'render' &&
				node.initializer &&
				ts.isJsxExpression(node.initializer) &&
				node.initializer.expression
			) {
				elements.push(node.initializer.expression);
			}
			if (ts.isCallExpression(node) && node.arguments[0] && this.readsElement(node.expression)) {
				elements.push(node.arguments[0]);
			}
			ts.forEachChild(node, visit);
		};
		visit(this.sf);
		for (const call of helperCalls ?? []) {
			const plan = effectHelpers(
				call,
				this.checker,
				(name) => this.reactHook(name),
				this.localUses,
				!hasEval,
			);
			if (!plan) continue;
			const captures = (this.effectHelperCaptures ??= new Map());
			captures.set(
				plan.callback,
				plan.declarations.map(({ statement }) => statement),
			);
			for (const { statement, move } of plan.declarations) {
				if (move) (this.effectEdits ??= new Map()).set(statement, DROP);
			}
		}
		if (!hasEval) for (const decl of snapshots) this.planEffectSnapshot(decl);
		if (!hasEval && this.options.linkRenderState && this.strong && this.target === 'tsrx') {
			for (const statement of this.sf.statements) {
				if (ts.isFunctionDeclaration(statement) && this.isComponent(statement))
					this.planLinkedState(statement);
			}
		}
		if (this.hasReactBridge) {
			// A namespace used only for the native bridge needs no missing-port report.
			for (const module of ['octane/react', 'octane/react/server']) {
				const port = this.ports.get(module);
				if (port?.name === module && !port.islands && !port.blocked) {
					this.ports.delete(module);
					this.unported.delete(module);
				}
			}
		}
		const pathSvgTags = new Set<ts.Node>();
		const unknownSvgSlots = new Map<ts.Node, string>();
		if (
			this.target === 'tsrx' &&
			this.options.pathSvgAdapter &&
			!hasEval &&
			!/@jsx(?:ImportSource|Runtime|Frag)?\b/i.test(this.source)
		) {
			for (const [declaration, binding] of this.imports) {
				if (
					!ts.isImportClause(declaration) ||
					!ts.isImportDeclaration(declaration.parent) ||
					!declaration.name ||
					declaration.namedBindings ||
					declaration.parent.attributes ||
					binding.typeOnly ||
					!/\.svg$/i.test(binding.module)
				)
					continue;
				const refs = this.localUses(declaration.name);
				const fixed =
					refs.length === 1 && this.options.fixedColorSvgAdapter
						? this.fixedSvgColor(refs[0])
						: undefined;
				const eligible = refs.map((ref) =>
					this.nativePathSvgUse(
						ref,
						this.localUses,
						(tag, prop) =>
							unknownSvgSlots.set(
								ref,
								` Cannot prove where <${tag.text}> renders its ${prop === 'children' ? 'children' : prop + ' prop'}.`,
							),
						fixed?.attribute,
					),
				);
				if (!eligible.length || eligible.includes(false)) continue;
				const native = fixed
					? this.options.fixedColorSvgAdapter?.(binding.module, fixed.color)
					: this.options.pathSvgAdapter(binding.module);
				if (!native) continue;
				if (fixed) this.removed.add(fixed.attribute);
				this.pathSvgImports.set(declaration.parent, native);
				for (const ref of refs) pathSvgTags.add(ref);
			}
		}
		const bareSvgImports = new Set<ts.Node>();
		if (this.target === 'tsrx' && /\.(?:jsx?|tsx)$/.test(this.filename)) {
			// An explicit loader, query, or fragment doesn't use the bare SVG convention.
			const bare = /^#?[^!?#]*\.svg$/i;
			for (const [declaration, entry] of this.imports) {
				if (
					entry.typeOnly ||
					(entry.imported !== 'default' && !entry.namespace) ||
					!bare.test(entry.module)
				)
					continue;
				const statement = ts.findAncestor(declaration, ts.isImportDeclaration);
				if (!statement?.attributes && bare.test(this.resolve(entry.module) ?? entry.module))
					bareSvgImports.add(declaration);
			}
		}
		for (const field of fields) {
			if (pathSvgTags.has(field.tagName)) this.count('svg-paths');
			else if (
				bareSvgImports.size &&
				isBareSvgTag(field.tagName, this.checker, bareSvgImports, this.localUses)
			) {
				this.note(
					this.nativeStoreHooks.size ? 'store-hook' : 'svg-issuer',
					'error',
					field.tagName,
					'This JSX tag can resolve to a bare SVG import. Loading the SVG from .tsrx can produce an asset URL. Import and render the SVG in a React-owned .tsx component hosted by ReactCompat, or configure a native SVG loader for .tsrx.' +
						(unknownSvgSlots.get(field.tagName) ?? '') +
						(this.options.pathSvgAdapter
							? ' For an asset with supported static geometry, run --svg-paths on the SVG file and verify the receiving renderer before using the native component.'
							: ''),
				);
			}
			if (this.takesChange(field)) this.planRestChange(field);
			if (!reactSvgImports.size) continue;
			const asset = this.importOf(field.tagName);
			if (!asset || !reactSvgImports.has(asset)) continue;
			if (
				ts.findAncestor(
					field,
					(node) =>
						(ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) &&
						((ts.isJsxElement(node.parent) &&
							this.reactCompatTag(node.parent.openingElement.tagName)) ||
							this.islands.has(node)),
				)
			)
				continue;
			reactSvgImports.delete(asset);
			this.note(
				RULE.bindings,
				'warning',
				field.tagName,
				`\`<${asset.local}>\` uses a React SVG import convention from \`${asset.module}\`. If your loader returns a React component, render it in a ReactCompat island or provide an Octane component.`,
			);
		}
		// Follow a local helper's inspected parameter back to its call arguments.
		// Each parameter is expanded once, including when helpers call one another.
		let calls: Map<string, ts.CallExpression[]> | undefined;
		const seen = new Set<ts.ParameterDeclaration>();
		for (const element of elements) {
			this.planDescriptorChildren(element);
			const value = skipWrappers(element);
			const param = ts.isIdentifier(value) && this.declarationOf(value);
			if (!param || !ts.isParameter(param) || param.dotDotDotToken || seen.has(param)) continue;
			seen.add(param);
			const fn = param.parent;
			let binding: ts.FunctionDeclaration | ts.VariableDeclaration;
			if (ts.isFunctionDeclaration(fn)) binding = fn;
			else if (
				ts.isVariableDeclaration(fn.parent) &&
				fn.parent.initializer === fn &&
				ts.getCombinedNodeFlags(fn.parent) & ts.NodeFlags.Const
			)
				binding = fn.parent;
			else continue;
			if (!binding.name || !ts.isIdentifier(binding.name)) continue;
			const index = fn.parameters
				.filter((p) => !ts.isIdentifier(p.name) || p.name.text !== 'this')
				.indexOf(param);
			calls ??= this.namedCalls();
			for (const call of calls.get(binding.name.text) ?? []) {
				if (!ts.isIdentifier(call.expression) || this.declarationOf(call.expression) !== binding)
					continue;
				if (call.arguments[index] && !call.arguments.slice(0, index + 1).some(ts.isSpreadElement)) {
					elements.push(call.arguments[index]);
				}
			}
		}
	}

	/** Indexed only for modules that inspect a local helper parameter. Resolve names at the use site. */
	namedCalls() {
		const calls = new Map<string, ts.CallExpression[]>();
		const visit = (node: ts.Node) => {
			if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.arguments.length) {
				const name = node.expression.text;
				const sites = calls.get(name);
				if (sites) sites.push(node);
				else calls.set(name, [node]);
			}
			ts.forEachChild(node, visit);
		};
		visit(this.sf);
		return calls;
	}

	/** Only one authored element can move into an explicit children prop. */
	singleElementChild(node: ts.JsxElement) {
		const { openingElement, closingElement, children } = node;
		if (
			!openingElement.attributes.properties.every(
				(attr) => ts.isJsxAttribute(attr) && attr.name.getText(this.sf) !== 'children',
			) ||
			closingElement.getText(this.sf) !== `</${openingElement.tagName.getText(this.sf)}>`
		)
			return null;
		const content = withoutJsxIndentation(children);
		const [child] = content;
		return content.length === 1 && (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child))
			? child
			: null;
	}

	/** The consolidated React package exports Slot as a namespace, unlike the binding. */
	planRadixSlots(binding: ts.Identifier, namespace: boolean) {
		const members = new Map<ts.MemberName, string>();
		for (const ref of this.localUses(binding)) {
			const first = directMember(ref);
			if (namespace && first && first.text !== 'Slot') continue;
			const member = namespace && first ? directMember(first.parent) : first;
			const name = member && RADIX_SLOT_MEMBERS.get(member.text);
			const access = member?.parent;
			const use = access?.parent;
			let reason: string | undefined;
			if (
				!use ||
				!(ts.isJsxOpeningElement(use) ||
				ts.isJsxSelfClosingElement(use) ||
				ts.isJsxClosingElement(use)
					? use.tagName === access
					: ts.isTypeQueryNode(use) && use.exprName === access)
			) {
				reason =
					'Use Radix Slot.Root, Slot.Slot, or Slot.Slottable as a direct JSX tag or type query to migrate it.';
			} else if (ts.isJsxOpeningElement(use) || ts.isJsxSelfClosingElement(use)) {
				if (!this.radixSlotChildren(use))
					reason = 'The codemod can only migrate Radix Slot with a single intrinsic element child.';
			}
			if (!member || !name || reason) {
				(this.radixSlotImports ??= new Map()).set(binding, 'original');
				this.note(
					RULE.binding,
					'error',
					ref,
					reason ?? 'The Octane binding has no equivalent Radix Slot member.',
				);
				return;
			}
			members.set(member, name);
		}
		for (const [member, name] of members) {
			const replacement = namespace
				? `${binding.text}.${name}`
				: name === 'Slot'
					? binding.text
					: undefined;
			if (!namespace && replacement) (this.radixSlotImports ??= new Map()).set(binding, 'native');
			(this.radixSlotMembers ??= new Map()).set(member, { replacement, name });
		}
	}

	/** An intrinsic child cannot be a Slottable marker or an alias of one. */
	radixSlotChildren(tag: ts.JsxOpeningLikeElement) {
		const intrinsic = (child: ts.Node | null) => {
			if (!child || (!ts.isJsxElement(child) && !ts.isJsxSelfClosingElement(child))) return false;
			const name = ts.isJsxElement(child) ? child.openingElement.tagName : child.tagName;
			return ts.isIdentifier(name) && /^[a-z]/.test(name.text);
		};
		if (ts.isJsxOpeningElement(tag)) return intrinsic(this.singleElementChild(tag.parent));
		return tag.attributes.properties.every((attr) => {
			if (!ts.isJsxAttribute(attr)) return false;
			if (attr.name.getText(this.sf) !== 'children') return true;
			const value = attr.initializer;
			return (
				!!value &&
				ts.isJsxExpression(value) &&
				!!value.expression &&
				intrinsic(skipWrappers(value.expression))
			);
		});
	}

	/**
	 * The package with no Octane port that a specifier names, or null. It
	 * still runs on React, which only the codemod's report and a comment say.
	 */
	portOf(module: string) {
		let port = this.ports.get(module);
		if (port === undefined) {
			const name = isApiModule(module) ? null : (this.options.unported?.(module) ?? null);
			port = name === null ? null : (this.unported.get(name) ?? { name, islands: 0, blocked: 0 });
			if (port) this.unported.set(port.name, port);
			this.ports.set(module, port);
		}
		return port;
	}

	/** Find the paragraph receiving an island through transparent child syntax. */
	private inParagraph(value: ts.Node) {
		for (;;) {
			const parent = value.parent;
			if (ts.isJsxElement(parent)) {
				const tag = parent.openingElement.tagName;
				if (this.calleeName(tag) !== 'Fragment') {
					if (!ts.isIdentifier(tag)) return false;
					// The emitter removes an earlier run's fallback around the original element.
					if (tag.text !== NO_PORT) return tag.text === 'p';
				}
			} else if (!(
				ts.isJsxFragment(parent) ||
				(ts.isJsxExpression(parent) && !parent.dotDotDotToken) ||
				isWrapper(parent) ||
				(ts.isConditionalExpression(parent) && parent.condition !== value) ||
				(ts.isBinaryExpression(parent) &&
					(parent.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
						parent.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
						(parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
							parent.right === value)))
			)) {
				return false;
			}
			value = parent;
		}
	}

	/**
	 * A component from a package with no Octane port renders in React, inside
	 * a `ReactCompat` island, when its element hands React nothing Octane
	 * renders. Its hooks and contexts cannot run in an Octane component, so
	 * they are reported.
	 */
	planUnported(node: ts.Identifier) {
		if (this.reactRendererBodies.has(node.parent)) return;
		const binding = this.inImport(node) ? null : this.importOf(node);
		const port = binding?.port;
		if (!port) return;
		// `Toast.Bar`, through a namespace or default import, is the member.
		const member =
			ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node
				? node.parent
				: node;
		const name = ts.isPropertyAccessExpression(member)
			? member.name.text
			: binding.imported === 'default' || binding.namespace
				? node.text
				: binding.imported;
		if (nativeReactCompat(binding.module, name)) return;
		const text = member.getText(this.sf);
		const parent = member.parent;
		const block = (message: string) => {
			port.blocked++;
			const error = `${message} \`${port.name}\` has no Octane port.`;
			this.note(RULE.bindings, 'error', member, error);
			return error;
		};
		if (
			(ts.isJsxOpeningElement(parent) || ts.isJsxSelfClosingElement(parent)) &&
			parent.tagName === member
		) {
			const element = ts.isJsxOpeningElement(parent) ? parent.parent : parent;
			const authored = this.authoredIsland(element);
			if (authored) {
				if (!this.islandRoot(authored, element)) {
					block(
						`Keep \`<${text}>\` in React. The codemod can transport one component child or a conditional selecting the same imported component on every branch. Move other selections and nested JSX into a React component.`,
					);
				} else if (!this.hostsInReact(element)) {
					block(
						`The props or children of \`<${text}>\` contain JSX that cannot cross into an authored ReactCompat boundary.`,
					);
				}
				return;
			}
			const paragraph = this.inParagraph(element);
			let reason = !this.hostsInReact(element)
				? `\`<${text}>\` takes children or props that Octane renders, which cannot cross into a React island.`
				: this.options.reactCompat
					? null
					: `\`<${text}>\` can render in a \`ReactCompat\` island only with React and React DOM 19.2 or newer in the React 19 series.`;
			if (reason === null && paragraph && !this.options.reactCompatInline)
				reason = `<${text}> needs ReactCompatInline to stay inside this paragraph. Install an Octane release that exports it or keep the paragraph in React.`;
			if (reason === null) {
				port.islands++;
				const importedName = ts.isPropertyAccessExpression(member)
					? member.name.text
					: binding.imported;
				if (
					binding.module === 'react-intl' &&
					(name === 'FormattedMessage' ||
						(this.options.reactIntlAdapter && INTL_FORMATTER.test(importedName)))
				)
					this.reportIntlFormatterOwner(element, 'generated island');
				this.islands.set(element, paragraph ? 'ReactCompatInline' : 'ReactCompat');
			} else {
				// Octane fails on a React component deep in its renderer, naming
				// neither it nor its package, so it throws this error there instead.
				this.unrenderable.set(element, block(reason));
			}
		} else if (ts.isCallExpression(parent) && parent.expression === member) {
			if (/^use[A-Z0-9]/.test(name))
				block(`\`${text}\` is a React hook, which Octane cannot call.`);
		} else if (
			ts.isCallExpression(parent) &&
			/^(?:use|useContext)$/.test(this.calleeName(parent.expression) ?? '')
		) {
			block(`\`${text}\` is a React context, which Octane cannot read.`);
		}
	}

	private reportIntlFormatterOwner(
		node: ts.Node,
		boundary: 'generated island' | 'generated native adapter',
	) {
		this.note(
			RULE.bindings,
			'error',
			node,
			`A React Intl formatter can depend on ancestor contexts or schedule React DOM resources outside this ${boundary}. Verify the provider and its formatters, or keep the formatter under its original React ancestors.`,
		);
	}

	private fixedSvgColor(ref: ts.Identifier) {
		const tag = ref.parent;
		if (!ts.isJsxSelfClosingElement(tag) || tag.tagName !== ref) return;
		const attribute = tag.attributes.properties.find(
			(attr): attr is ts.JsxAttribute =>
				ts.isJsxAttribute(attr) && ts.isIdentifier(attr.name) && attr.name.text === 'style',
		);
		const value = attribute?.initializer;
		if (!attribute || !value || !ts.isJsxExpression(value) || /\/[/*]/.test(attribute.getText()))
			return;
		const object = value.expression;
		if (!object || !ts.isObjectLiteralExpression(object) || object.properties.length !== 1) return;
		const property = object.properties[0];
		if (
			!ts.isPropertyAssignment(property) ||
			!ts.isIdentifier(property.name) ||
			property.name.text !== 'color' ||
			!ts.isStringLiteral(property.initializer)
		)
			return;
		const match = /^var\((--[a-z][a-z0-9-]*)\)$/.exec(property.initializer.text);
		if (!match) return;
		// Keep the styled element in a direct return through intrinsic children.
		let output: ts.Node = tag;
		while (
			ts.isJsxElement(output.parent) &&
			ts.isIdentifier(output.parent.openingElement.tagName) &&
			/^[a-z]/.test(output.parent.openingElement.tagName.text)
		)
			output = output.parent;
		while (ts.isParenthesizedExpression(output.parent)) output = output.parent;
		const ret = output.parent;
		if (
			ts.isReturnStatement(ret) &&
			ts.isBlock(ret.parent) &&
			ts.isFunctionDeclaration(ret.parent.parent) &&
			ret.parent.statements.length === 1
		)
			return { attribute, color: match[1] };
	}

	nativePathSvgUse(
		ref: ts.Identifier,
		uses: ReturnType<typeof localUses>,
		unproven: (tag: ts.Identifier, prop: string) => void,
		fixedStyle?: ts.JsxAttribute,
	) {
		const tag = ref.parent;
		if (!ts.isJsxSelfClosingElement(tag) || tag.tagName !== ref || tag.typeArguments) return false;
		const supported = tag.attributes.properties.every((attr) => {
			if (attr === fixedStyle) return true;
			if (!ts.isJsxAttribute(attr) || !ts.isIdentifier(attr.name)) return false;
			const value = attr.initializer;
			if (attr.name.text === 'style')
				return attributeOf(tag, 'style') === attr && this.svgInlineTransform(value);
			if (attr.name.text === 'className')
				return (
					!!value &&
					(ts.isStringLiteral(value) ||
						(ts.isJsxExpression(value) &&
							!!value.expression &&
							this.svgClassName(value.expression)))
				);
			if (
				value &&
				ts.isStringLiteral(value) &&
				(svgDataAttribute(attr.name.text) || svgLiteralRootOverride(attr.name.text, value.text))
			)
				return true;
			return attr.name.text === 'aria-hidden' && literalJsxAttribute(attr);
		});
		if (!supported) return false;
		this.svgRead ??= svgLocalReads(
			this.checker,
			uses,
			(node) => this.typeOf(node),
			(type) => ts.isTypeReferenceNode(type) && this.reactTypeName(type.typeName) === 'ReactNode',
		);
		return this.nativeOutput(this.svgRead(tag) ?? tag, uses, unproven);
	}

	private planLinkedState(owner: ts.FunctionDeclaration) {
		const plan = linkedRenderState(
			owner,
			this.checker,
			(name) => this.localUses(name),
			(expr) => {
				const hook = this.callee(expr);
				return hook?.module === 'react' && hook.name === 'useState';
			},
			(expr) => this.strictTypes && isBooleanGuardType(this.typeOf(expr)),
		);
		if (!plan) return;
		const fresh = (base: string) => {
			let name = base;
			while (this.declared.has(name) || this.readsGlobal(name)) name += '_';
			this.declared.add(name);
			return name;
		};
		const hook = this.require('octane', 'useLinkedState', false);
		// These locals live in separate component scopes. Reserve names against the source once.
		const [active, previous, seen, initialName] = (this.linkedStateNames ??= [
			fresh('active'),
			fresh('previous'),
			fresh('seen'),
			fresh('initial'),
		]);
		const initial = plan.eager ? initialName : active;
		const indent = this.indentOf(plan.state),
			line = '\n' + indent,
			inner = line + this.indentUnit;
		const flag = plan.flag.getText(this.sf);
		const eager = plan.eager ? `const ${initial} = ${plan.eager.getText(this.sf)};${line}` : '';
		const input = plan.eager ? `!!(${flag})` : flag;
		const replay = plan.replay.map((read) => `void (${read.getText(this.sf)});`).join(' ');
		// Re-read the original prelude before publication: a retrying getter can suspend.
		const replacement =
			eager +
			`const [${plan.name}] = ${hook}(${input}, (${active}, ${previous}): boolean => {${inner}` +
			`const ${seen} = (${previous}?.value ?? ${initial}) === true;${inner}` +
			`if (${active} && !${seen}) { ${replay} }${inner}return ${seen} || ${active};${line}});`;
		const edits = (this.linkedStateEdits ??= new Map());
		edits.set(plan.state, replacement);
		edits.set(plan.guard, DROP);
	}

	/** In a candidate module, locally constructed elements can leave only as this component's output. */
	private elementsOnlyInReturn(owner: ts.FunctionDeclaration) {
		const hooks = new Set(['useState', 'useEffect', 'useRef']);
		const escapes = (node: ts.Node): boolean => {
			if (isJsx(node)) {
				if (!ts.isJsxSelfClosingElement(node)) return true;
				let output: ts.Node = node;
				while (
					ts.isParenthesizedExpression(output.parent) ||
					(ts.isConditionalExpression(output.parent) && output !== output.parent.condition)
				)
					output = output.parent;
				if (
					!ts.isReturnStatement(output.parent) ||
					ts.findAncestor(output.parent, ts.isFunctionLike) !== owner
				)
					return true;
			}
			if (
				ts.isCallExpression(node) &&
				(node.expression.kind === ts.SyntaxKind.ImportKeyword ||
					(ts.isIdentifier(node.expression) && node.expression.text === 'require'))
			)
				return true;
			if (
				ts.isIdentifier(node) &&
				this.apiLocals.has(node.text) &&
				!this.inImport(node) &&
				!inTypeNode(node)
			) {
				const api = this.importOf(node);
				if (api && !api.typeOnly) {
					const name =
						api.namespace &&
						ts.isPropertyAccessExpression(node.parent) &&
						node.parent.expression === node
							? node.parent.name.text
							: api.imported;
					if (api.module !== 'react' || !hooks.has(name)) return true;
				}
			}
			return ts.forEachChild(node, (child) => escapes(child) || undefined) === true;
		};
		return !escapes(this.sf);
	}

	/** Standard library scalar observations can be captured at the same instant. */
	private platformScalar(expr: ts.Expression): boolean {
		const types = this.options.types;
		const peer =
			types?.sourceFile.text === this.source
				? nodeSpanning(types.sourceFile, expr.getStart(), expr.end)
				: expr;
		if (!peer || peer.kind !== expr.kind) return false;
		const check = peer === expr ? this.checker : types!.checker;
		const member = ts.isCallExpression(peer) && !peer.arguments.length ? peer.expression : peer;
		return (
			ts.isPropertyAccessExpression(member) &&
			ts.isIdentifier(member.expression) &&
			[member.expression, member.name].every(
				(id) => check.getSymbolAtLocation(id)?.valueDeclaration?.getSourceFile().hasNoDefaultLib,
			) &&
			scalar(check.getTypeAtLocation(peer))
		);
	}

	/** Keep an immutable mount value in a ref when only sibling React effects observe it. */
	private planEffectSnapshot(decl: ts.VariableDeclaration) {
		const call = decl.initializer;
		const element = ts.isArrayBindingPattern(decl.name) ? decl.name.elements[0] : undefined;
		if (
			!ts.isVariableDeclarationList(decl.parent) ||
			!(decl.parent.flags & ts.NodeFlags.Const) ||
			decl.type ||
			!element ||
			!ts.isBindingElement(element) ||
			!ts.isIdentifier(element.name) ||
			element.initializer ||
			element.dotDotDotToken ||
			!call ||
			!ts.isCallExpression(call) ||
			call.questionDotToken ||
			call.arguments.length !== 1 ||
			!ts.isArrowFunction(call.arguments[0]) ||
			call.arguments[0].modifiers?.length
		)
			return;
		const state = this.callee(call.expression);
		if (
			state?.module !== 'react' ||
			state.name !== 'useState' ||
			/\/[*/]/.test(decl.name.getText(this.sf)) ||
			/\/[*/]/.test(call.expression.getText(this.sf))
		)
			return;

		const name = element.name;
		const owner = ts.findAncestor(decl, ts.isFunctionLike);
		if (
			!owner ||
			!ts.isFunctionDeclaration(owner) ||
			!owner.name ||
			!ts.isSourceFile(owner.parent) ||
			this.localUses(owner.name).some((ref) => !inTypeNode(ref))
		)
			return;
		// Forward unchanged arguments, literals, and platform scalars in ordinary records.
		// A callable or a local component result could have renderer-specific identity.
		const data = (input: ts.Expression): boolean => {
			const expr = skipWrappers(input);
			if (ts.isObjectLiteralExpression(expr))
				return expr.properties.every(
					(field) =>
						(ts.isPropertyAssignment(field) &&
							(ts.isIdentifier(field.name) ||
								ts.isStringLiteralLike(field.name) ||
								ts.isNumericLiteral(field.name)) &&
							field.name.text !== '__proto__' &&
							data(field.initializer)) ||
						(ts.isShorthandPropertyAssignment(field) &&
							!field.objectAssignmentInitializer &&
							data(field.name)),
				);
			if (ts.isIdentifier(expr)) {
				const symbol = ts.isShorthandPropertyAssignment(expr.parent)
					? this.checker.getShorthandAssignmentValueSymbol(expr.parent)
					: this.checker.getSymbolAtLocation(expr);
				const binding = symbol?.valueDeclaration;
				if (
					!binding ||
					!(ts.isParameter(binding) || ts.isBindingElement(binding)) ||
					!ts.isIdentifier(binding.name)
				)
					return false;
				let param: ts.Node = binding;
				while (ts.isBindingElement(param) && !param.initializer) param = param.parent.parent;
				return (
					ts.isParameter(param) &&
					param.parent === owner &&
					!param.initializer &&
					fixedBinding(this.checker, binding.name, call)
				);
			}
			if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.PlusToken)
				return data(expr.left) && data(expr.right);
			return (
				ts.isStringLiteralLike(expr) ||
				ts.isNumericLiteral(expr) ||
				expr.kind === ts.SyntaxKind.NullKeyword ||
				expr.kind === ts.SyntaxKind.TrueKeyword ||
				expr.kind === ts.SyntaxKind.FalseKeyword ||
				this.platformScalar(expr)
			);
		};
		const body = call.arguments[0].body;
		if (ts.isBlock(body) || !ts.isObjectLiteralExpression(skipWrappers(body)) || !data(body))
			return;
		const effectCallback = (call: ts.Node) => {
			if (
				!ts.isCallExpression(call) ||
				call.questionDotToken ||
				call.arguments.length !== 2 ||
				!ts.isArrayLiteralExpression(call.arguments[1])
			)
				return;
			const [callback] = call.arguments;
			const hook = this.callee(call.expression);
			if (
				hook?.module !== 'react' ||
				hook.name !== 'useEffect' ||
				!ts.isArrowFunction(callback) ||
				!ts.isBlock(callback.body) ||
				callback.parameters.length ||
				callback.modifiers?.length ||
				ts.findAncestor(call, ts.isFunctionLike) !== owner
			)
				return;
			// A capture must not displace a directive prologue.
			const first = callback.body.statements[0];
			if (first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression)) return;
			return callback;
		};
		const callbacks = new Set<ts.ArrowFunction>();
		const deps: ts.Identifier[] = [];
		for (const ref of this.localUses(name)) {
			const list = ref.parent;
			if (
				ts.isArrayLiteralExpression(list) &&
				ts.isCallExpression(list.parent) &&
				list.parent.arguments[1] === list &&
				effectCallback(list.parent)
			) {
				deps.push(ref);
				continue;
			}
			const arrow = ts.findAncestor(
				ref,
				(n): n is ts.ArrowFunction =>
					ts.isArrowFunction(n) && ref.pos >= n.body.pos && effectCallback(n.parent) === n,
			);
			if (!arrow) return;
			callbacks.add(arrow);
		}
		if (!callbacks.size || !this.elementsOnlyInReturn(owner)) return;
		let cell = name.text + 'Ref';
		while (this.declared.has(cell) || this.readsGlobal(cell)) cell += '_';
		this.declared.add(cell);
		const edits = (this.effectEdits ??= new Map());
		const joined = decl.name.getStart(this.sf) === decl.parent.getStart(this.sf) + 'const'.length;
		edits.set(decl.name, joined ? ' ' + cell : cell);
		edits.set(call, this.require('octane', 'useLazyRef', false));
		for (const dep of deps) edits.set(dep, cell);
		for (const cb of callbacks) {
			const captures = (this.snapshotCaptures ??= new Map());
			const prev = captures.get(cb) ?? [];
			prev.push(`const ${name.text} = ${cell}.current;`);
			captures.set(cb, prev);
		}
	}

	private references?: ReturnType<typeof localUses>;
	private get localUses() {
		return (this.references ??= localUses(this.sf, this.checker));
	}

	private cssClassBindings?: Set<ts.Node>;
	private findCssClassBindings() {
		const files = new Map<ts.Node, string>();
		const mutable = new Set<string>();
		for (const [decl, binding] of this.imports) {
			if (binding.typeOnly) continue;
			const file = this.options.cssModuleFile?.(binding.module);
			if (!file) continue;
			files.set(decl, file);
			if (
				binding.imported !== 'default' ||
				!(ts.isImportClause(decl) || ts.isImportSpecifier(decl)) ||
				!decl.name ||
				ts.findAncestor(decl, ts.isImportDeclaration)?.attributes ||
				(this.resolve(binding.module) ?? binding.module) !== binding.module ||
				!renderUses(this.localUses(decl.name)).every(readsCssToken)
			)
				mutable.add(file);
		}
		const safe = new Set<ts.Node>();
		for (const [decl, file] of files) if (!mutable.has(file)) safe.add(decl);
		return safe;
	}

	private svgCssClass(expr: ts.PropertyAccessExpression) {
		if (expr.questionDotToken || !ts.isIdentifier(expr.expression)) return false;
		const decl = this.declarationOf(expr.expression);
		if (!decl || !this.imports.get(decl)?.module.endsWith('.module.css')) return false;
		this.cssClassBindings ??= this.findCssClassBindings();
		return this.cssClassBindings.has(decl);
	}

	private fixedSvgParameters?: Map<ts.Symbol, boolean>;
	private svgClassString(name: ts.Identifier) {
		const declaration = this.declarationOf(name);
		if (declaration && ts.isVariableDeclaration(declaration))
			return (
				!!declaration.initializer && ts.isStringLiteralLike(skipWrappers(declaration.initializer))
			);
		if (
			!declaration ||
			!(ts.isParameter(declaration) || ts.isBindingElement(declaration)) ||
			declaration.initializer
		)
			return false;
		const parameter = ts.isParameter(declaration) ? declaration : declaration.parent.parent;
		return (
			ts.isParameter(parameter) &&
			!!parameter.type &&
			!parameter.initializer &&
			textKind(this.typeOf(declaration.name)) === 1
		);
	}

	private svgClassName(expr: ts.Expression) {
		if (ts.isIdentifier(expr)) return true;
		if (ts.isPropertyAccessExpression(expr)) return this.svgCssClass(expr);
		if (ts.isConditionalExpression(expr))
			return (
				ts.isStringLiteralLike(skipWrappers(expr.whenTrue)) &&
				ts.isStringLiteralLike(skipWrappers(expr.whenFalse)) &&
				svgClassToken(
					expr,
					(name) =>
						fixedBinding(this.checker, name, expr, (this.fixedSvgParameters ??= new Map())) &&
						initializedBefore(this.checker, name, expr),
				)
			);
		if (!ts.isCallExpression(expr) || !ts.isIdentifier(expr.expression)) return false;
		const declaration = this.declarationOf(expr.expression);
		const binding = declaration && this.imports.get(declaration);
		return (
			binding?.module === 'clsx' &&
			!binding.typeOnly &&
			(binding.imported === 'default' || binding.imported === 'clsx') &&
			!ts.findAncestor(declaration!, ts.isImportDeclaration)?.attributes &&
			(this.resolve('clsx') ?? 'clsx') === 'clsx' &&
			this.options.installedClsx === true &&
			(expr.arguments.every((arg) =>
				svgClassToken(
					arg,
					(name, truthTest) =>
						(truthTest || this.svgClassString(name)) &&
						fixedBinding(this.checker, name, expr, (this.fixedSvgParameters ??= new Map())) &&
						initializedBefore(this.checker, name, expr),
				),
			) ||
				expr.arguments.every((arg) => {
					const token = skipWrappers(arg);
					return (
						ts.isStringLiteralLike(token) ||
						(ts.isPropertyAccessExpression(token) && this.svgCssClass(token))
					);
				}))
		);
	}

	private svgInlineTransform(value: ts.JsxAttributeValue | undefined) {
		if (!value || !ts.isJsxExpression(value) || value.dotDotDotToken || !value.expression)
			return false;
		const object = skipWrappers(value.expression);
		if (!ts.isObjectLiteralExpression(object) || object.properties.length !== 1) return false;
		const [field] = object.properties;
		if (
			!ts.isPropertyAssignment(field) ||
			!ts.isIdentifier(field.name) ||
			field.name.text !== 'transform'
		)
			return false;
		const text = skipWrappers(field.initializer);
		// Keep exactly one declaration, with no renderer-specific priority handling.
		if (ts.isStringLiteralLike(text)) return text.text.trim() !== '' && !/[!;]/.test(text.text);
		if (!ts.isTemplateExpression(text) || /[!;]/.test(text.head.text)) return false;
		const numeric = (node: ts.Expression) => {
			node = skipWrappers(node);
			return (
				ts.isNumericLiteral(node) ||
				(ts.isPrefixUnaryExpression(node) &&
					(node.operator === ts.SyntaxKind.MinusToken ||
						node.operator === ts.SyntaxKind.PlusToken) &&
					ts.isNumericLiteral(skipWrappers(node.operand)))
			);
		};
		return text.templateSpans.every(({ expression, literal }) => {
			if (/[!;]/.test(literal.text)) return false;
			const part = skipWrappers(expression);
			if (numeric(part)) return true;
			if (!ts.isConditionalExpression(part)) return false;
			const test = skipWrappers(part.condition);
			return (
				ts.isIdentifier(test) &&
				fixedBinding(this.checker, test, part, (this.fixedSvgParameters ??= new Map())) &&
				initializedBefore(this.checker, test, part) &&
				numeric(part.whenTrue) &&
				numeric(part.whenFalse)
			);
		});
	}

	private svgRead?: ReturnType<typeof svgLocalReads>;
	private nativeSvgProps?: ReturnType<typeof forwardedProps>;
	private provenSvgOwners?: Set<ts.Node>;
	private nativeOutput(
		value: ts.Node,
		uses: ReturnType<typeof localUses>,
		unproven?: (tag: ts.Identifier, prop: string) => void,
	): boolean {
		const typeOf = (node: ts.Node) => this.typeOf(node);
		const destination = {
			typeOf,
			text: (node: ts.Node) => textKind(typeOf(node)) !== 0,
			imported: this.options.forwardedRender,
		};
		this.nativeSvgProps ??= forwardedProps(this.sf, this.checker, destination, uses);
		const slot = (tag: ts.Identifier, prop: string) => {
			const known = this.nativeSvgProps!(this.checker.getSymbolAtLocation(tag), prop);
			if (!known) unproven?.(tag, prop);
			return known;
		};
		const first = nativeOutputOwner(value, slot, destination);
		if (!first) return false;
		const pending = [first];
		const proven = (this.provenSvgOwners ??= new Set());
		const seen = new Set<ts.Node>();
		let exported = false;
		// A local function can hand its return value to another renderer. Follow every
		// use of its binding, including uses of a component that also has an export.
		while (pending.length) {
			const fn = pending.pop()!;
			if (
				!this.isComponent(fn) ||
				fn.asteriskToken ||
				fn.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ||
				(ts.isFunctionExpression(fn) && fn.name)
			)
				return false;
			if (proven.has(fn)) {
				exported = true;
				continue;
			}
			if (seen.has(fn)) continue;
			seen.add(fn);
			const parent = fn.parent;
			if (ts.isExportAssignment(parent) && parent.parent === this.sf) {
				exported = true;
				continue;
			}
			const variable =
				ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name) ? parent : null;
			const statement = variable ? variable.parent.parent : fn;
			if (
				statement.parent !== this.sf ||
				!(ts.isFunctionDeclaration(statement) || ts.isVariableStatement(statement))
			)
				return false;
			const name = variable ? variable.name : fn.name;
			const refs = name && ts.isIdentifier(name) ? renderUses(uses(name)) : [];
			const directExport = statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
			if (!refs.length && !directExport) return false;
			if (directExport) exported = true;
			for (const ref of refs) {
				const tag = ref.parent;
				if (ts.isExportSpecifier(tag) || ts.isExportAssignment(tag)) {
					exported = true;
					continue;
				}
				if (
					!(
						ts.isJsxSelfClosingElement(tag) ||
						ts.isJsxOpeningElement(tag) ||
						ts.isJsxClosingElement(tag)
					) ||
					tag.tagName !== ref
				)
					return false;
				const owner = nativeOutputOwner(
					ts.isJsxSelfClosingElement(tag) ? tag : tag.parent,
					slot,
					destination,
				);
				if (!owner) return false;
				pending.push(owner);
			}
		}
		if (exported) proven.add(first);
		return exported;
	}

	/** Keep the imported React component as the type of the element the service receives. */
	storeReactDescriptor(element: ts.JsxSelfClosingElement) {
		const tag = element.tagName;
		if (
			!ts.isIdentifier(tag) ||
			!/^[A-Z]/.test(tag.text) ||
			/@jsx(?:ImportSource|Runtime|Frag)?\b/i.test(this.source)
		)
			return null;
		const item = this.checker.getSymbolAtLocation(tag)?.declarations?.[0];
		const binding = this.importOf(tag);
		if (
			!item ||
			!ts.isImportSpecifier(item) ||
			!binding ||
			binding.typeOnly ||
			binding.imported === 'default' ||
			item.parent.parent.parent.attributes ||
			!this.options.reactStoreComponent?.(binding.module) ||
			this.resolve(binding.module) !== null
		)
			return null;
		// The inserted names must be free both at module scope and at each call site.
		if (!this.storeSourceNames) {
			const names = new Set<string>();
			const visit = (node: ts.Node) => {
				if (ts.isIdentifier(node)) names.add(node.text);
				ts.forEachChild(node, visit);
			};
			visit(this.sf);
			this.storeSourceNames = names;
		}
		if (
			this.storeSourceNames.has('jsx') ||
			(this.nativeIntl.has(item) && this.storeSourceNames.has('OriginalReact' + tag.text))
		)
			return null;
		const props = staticReactProps(element);
		return props === null ? null : { item, props };
	}

	/**
	 * Whether a React component's element can be the root of a `ReactCompat`
	 * island: React renders all of it, so its children are text and no prop
	 * holds an element, as JSX here, through a value this module declares, or
	 * by its type.
	 */
	hostsInReact(element: ts.JsxElement | ts.JsxSelfClosingElement) {
		// By type: a cast to `any` or `ReactNode` proves nothing.
		const text = (child: ts.JsxChild) =>
			ts.isJsxText(child) ||
			(ts.isJsxExpression(child) &&
				(!child.expression || textKind(this.typeOf(child.expression)) !== 0));
		if (ts.isJsxElement(element) && !element.children.every(text)) return false;
		const attributes = ts.isJsxElement(element)
			? element.openingElement.attributes
			: element.attributes;
		const renderers = new Map<ts.Node, string>();
		const blocked = walkLocalValues(attributes, this.checker, (node, visit) => {
			if (
				this.options.reactCompat &&
				ts.isJsxAttribute(node) &&
				node.parent === attributes &&
				node.initializer &&
				ts.isJsxExpression(node.initializer) &&
				node.initializer.expression &&
				ts.isObjectLiteralExpression(node.initializer.expression)
			) {
				const fields = node.initializer.expression.properties;
				const wrappers = fields.map(reactRenderer);
				if (wrappers.some(Boolean)) {
					if (this.readsGlobal('jsx') || this.readsGlobal('OctaneJsx')) return true;
					const hasValue = wrappers.some((wrapper) => wrapper?.value);
					// An island can defer the whole props expression, including
					// reads next to the React value.
					if (hasValue) {
						if (
							!this.options.reactIntlAdapter ||
							!ts.isJsxSelfClosingElement(element) ||
							!ts.isIdentifier(element.tagName) ||
							this.authoredIsland(element) ||
							/@jsx(?:ImportSource|Runtime|Frag)?\b/i.test(this.source) ||
							attributes.properties.some((attr) => attr !== node && !literalJsxAttribute(attr))
						)
							return true;
						const declaration = this.declarationOf(element.tagName);
						const binding = declaration && this.imports.get(declaration);
						if (
							!declaration ||
							!ts.isImportSpecifier(declaration) ||
							declaration.parent.parent.parent.attributes ||
							binding?.module !== 'react-intl' ||
							binding.imported !== 'FormattedMessage' ||
							!this.options.reactStoreComponent?.(binding.module)
						)
							return true;
					}
					return fields.some((field, index) => {
						const wrapper = wrappers[index];
						if (!wrapper) {
							const value =
								ts.isPropertyAssignment(field) && !ts.isComputedPropertyName(field.name)
									? field.initializer
									: ts.isShorthandPropertyAssignment(field)
										? field.name
										: undefined;
							if (!value) return true;
							const literal = skipParens(value);
							const primitive =
								literal.kind === ts.SyntaxKind.TrueKeyword ||
								literal.kind === ts.SyntaxKind.FalseKeyword ||
								literal.kind === ts.SyntaxKind.NullKeyword ||
								(ts.isIdentifier(literal) &&
									literal.text === 'undefined' &&
									!this.declarationOf(literal)) ||
								(hasValue
									? ts.isStringLiteralLike(literal) ||
										ts.isNumericLiteral(literal) ||
										ts.isBigIntLiteral(literal)
									: textKind(this.typeOf(value)) !== 0);
							return !primitive || visit(field);
						}
						if (
							['jsx', 'OctaneJsx'].some((name) =>
								this.checker.resolveName(name, wrapper.body, ts.SymbolFlags.Value, false),
							)
						)
							return true;
						renderers.set(wrapper.body, wrapper.args);
						return false;
					});
				}
			}
			if (isJsx(node)) return !this.reactRendererBodies.has(node);
			if (ts.isIdentifier(node)) {
				const project = this.projectType(node);
				const type = (project?.checker ?? this.checker).typeToString(
					project?.type ?? this.checker.getTypeAtLocation(node),
					undefined,
					ts.TypeFormatFlags.NoTruncation,
				);
				if (/\b(?:React(?:Node|Element)|JSX\.Element)\b/.test(type)) return true;
			}
			return undefined;
		});
		if (blocked) return false;
		for (const [body, args] of renderers) this.reactRendererBodies.set(body, args);
		return true;
	}

	reactCompatTag(tag: ts.JsxTagNameExpression) {
		const entry = this.importOf(ts.isPropertyAccessExpression(tag) ? tag.expression : tag);
		if (!entry) return false;
		const name = ts.isPropertyAccessExpression(tag)
			? entry.namespace
				? tag.name.text
				: ''
			: entry.imported;
		return nativeReactCompat(entry.module, name);
	}

	authoredIsland(element: ts.JsxElement | ts.JsxSelfClosingElement) {
		if (!this.hasReactBridge) return undefined;
		return ts.findAncestor(
			element.parent,
			(n): n is ts.JsxElement | ts.JsxSelfClosingElement =>
				(ts.isJsxElement(n) && this.reactCompatTag(n.openingElement.tagName)) ||
				(ts.isJsxSelfClosingElement(n) && this.reactCompatTag(n.tagName)),
		);
	}

	/** The bridge accepts one component descriptor and snapshots its props shallowly. */
	islandRoot(
		owner: ts.JsxElement | ts.JsxSelfClosingElement,
		element: ts.JsxElement | ts.JsxSelfClosingElement,
	) {
		if (!ts.isJsxElement(owner)) return false;
		const children = contentOf(owner).filter(
			(child) => !ts.isJsxExpression(child) || child.expression !== undefined,
		);
		if (children.length !== 1) return false;
		const tagName = (ts.isJsxElement(element) ? element.openingElement : element).tagName.getText(
			this.sf,
		);
		let selected = false;
		function component(node: ts.Node): boolean {
			if (ts.isJsxExpression(node)) return !!node.expression && component(node.expression);
			if (isWrapper(node)) return component(node.expression);
			if (ts.isConditionalExpression(node))
				return component(node.whenTrue) && component(node.whenFalse);
			const tag = ts.isJsxElement(node)
				? node.openingElement.tagName
				: ts.isJsxSelfClosingElement(node)
					? node.tagName
					: undefined;
			if (!tag || tag.getText() !== tagName) return false;
			if (node === element) selected = true;
			return true;
		}
		return component(children[0]) && selected;
	}

	/**
	 * Whether a callee reads its argument as an element: `cloneElement`,
	 * `isValidElement`, or a `Children` method.
	 */
	readsElement(callee: ts.Expression) {
		const name = this.calleeName(callee);
		if (name === 'cloneElement' || name === 'isValidElement') return true;
		return (
			ts.isPropertyAccessExpression(callee) && this.calleeName(callee.expression) === 'Children'
		);
	}

	/** The declaration holding a component, including memo/forwardRef wrappers. */
	componentHolder(component: ts.SignatureDeclaration) {
		let holder = component.parent;
		while (
			ts.isCallExpression(holder) &&
			/^(?:memo|forwardRef)$/.test(this.calleeName(holder.expression) ?? '')
		)
			holder = holder.parent;
		return holder;
	}

	/**
	 * A narrow React element slot cannot receive the block produced by a nested
	 * template call. Preserve the declared contract and explain the two choices.
	 */
	checkElementChildren(fn: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction) {
		const props = fn.parameters[0]?.type;
		if (!props) return;
		const declaration = this.checker
			.getTypeFromTypeNode(props)
			.getProperty('children')?.valueDeclaration;
		if (!declaration || !ts.isPropertySignature(declaration) || !declaration.type) return;
		if (!this.elementSlotType(declaration.type)) return;
		const holder = this.componentHolder(fn);
		if (
			(ts.isVariableDeclaration(holder) && this.descriptorComponents.has(holder)) ||
			(ts.isFunctionDeclaration(fn) && this.descriptorComponents.has(fn)) ||
			(ts.isCallExpression(holder) && this.calleeName(holder.expression) === 'descriptorChildren')
		)
			return;
		if (
			ts.isFunctionDeclaration(fn) &&
			fn.name &&
			fn.parent === this.sf &&
			this.checker.getSymbolAtLocation(fn.name)?.declarations?.length === 1 &&
			this.acceptsSingleElement(declaration.type)
		) {
			const flags = ts.getCombinedModifierFlags(fn);
			this.elementChildren.push({
				start: fn.getStart(this.sf),
				exported:
					flags & ts.ModifierFlags.Export
						? flags & ts.ModifierFlags.Default
							? 'default'
							: fn.name.text
						: undefined,
			});
		}
		this.note(
			RULE.elementChildren,
			'warning',
			fn,
			'Nested TSRX children arrive as a render block. Pass element values explicitly with `children={...}` to keep this slot’s element type. If it only renders content and should accept nested templates, include `ChildrenBlock` from `octane/tsrx-boundary` in the children type.',
		);
	}

	// The caller already established that this is an element-only slot. Array-only
	// and parameterized element types still need the author's review.
	acceptsSingleElement(type: ts.TypeNode): boolean {
		if (ts.isParenthesizedTypeNode(type)) return this.acceptsSingleElement(type.type);
		if (ts.isUnionTypeNode(type)) return type.types.some((t) => this.acceptsSingleElement(t));
		return ts.isTypeReferenceNode(type) && !type.typeArguments?.length;
	}

	elementSlotType(type: ts.TypeNode): boolean {
		if (
			ts.isParenthesizedTypeNode(type) ||
			(ts.isTypeOperatorNode(type) && type.operator === ts.SyntaxKind.ReadonlyKeyword)
		)
			return this.elementSlotType(type.type);
		if (ts.isArrayTypeNode(type)) return this.elementSlotType(type.elementType);
		if (ts.isUnionTypeNode(type)) {
			const values = type.types.filter(
				(t) =>
					t.kind !== ts.SyntaxKind.UndefinedKeyword &&
					!(ts.isLiteralTypeNode(t) && t.literal.kind === ts.SyntaxKind.NullKeyword),
			);
			return values.length > 0 && values.every((t) => this.elementSlotType(t));
		}
		if (!ts.isTypeReferenceNode(type)) return false;
		const name = type.typeName;
		if (ts.isIdentifier(name)) {
			const imported = this.importOf(name);
			return imported?.module === 'react' && imported.imported === 'ReactElement';
		}
		if (name.right.text === 'ReactElement') return this.isReactNamespace(name.left);
		if (name.right.text !== 'Element') return false;
		if (ts.isQualifiedName(name.left))
			return name.left.right.text === 'JSX' && this.isReactNamespace(name.left.left);
		const imported = this.importOf(name.left);
		return imported
			? imported.module === 'react' && imported.imported === 'JSX'
			: this.isGlobalNamespace(name.left, 'JSX');
	}

	/**
	 * React passes a component its JSX children as elements, which
	 * `render={children}` and `cloneElement(children)` rely on. Octane passes a
	 * compiled render body unless the component is marked `descriptorChildren`,
	 * so mark the component whose own `children` this reads.
	 */
	planDescriptorChildren(expression: ts.Expression) {
		const value = skipWrappers(expression);
		const component = this.childrenOwner(value);
		if (!component) return;
		const holder = this.componentHolder(component);
		if (ts.isCallExpression(holder) && this.calleeName(holder.expression) === 'descriptorChildren')
			return;
		// The compiler reads the marker from module-level `const` bindings only.
		if (
			ts.isVariableDeclaration(holder) &&
			ts.isIdentifier(holder.name) &&
			ts.getCombinedNodeFlags(holder) & ts.NodeFlags.Const &&
			holder.parent.parent.parent === this.sf
		) {
			this.descriptorComponents.add(holder);
		} else if (
			ts.isFunctionDeclaration(component) &&
			component.parent === this.sf &&
			component.name &&
			!component.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword) &&
			// Overload signatures would stay `function` declarations.
			this.checker.getSymbolAtLocation(component.name)?.declarations?.length === 1 &&
			this.declaredBeforeUse(component)
		) {
			this.descriptorComponents.add(component);
		} else {
			this.note(
				RULE.descriptorChildren,
				'warning',
				expression,
				'This reads `children` as an element, which Octane passes as a compiled render body; mark the component with `descriptorChildren` so callers pass element descriptors.',
			);
		}
	}

	/**
	 * The component whose own `children` prop `node` is: `children` from its
	 * props pattern, or `props.children`.
	 */
	childrenOwner(node: ts.Expression): ts.SignatureDeclaration | null {
		let props: ts.Node | null = null;
		if (ts.isPropertyAccessExpression(node) && node.name.text === 'children') {
			props = ts.isIdentifier(node.expression) ? this.declarationOf(node.expression) : null;
		} else if (ts.isIdentifier(node)) {
			const declaration = this.declarationOf(node);
			if (
				declaration &&
				ts.isBindingElement(declaration) &&
				(declaration.propertyName ?? declaration.name).getText(this.sf) === 'children'
			) {
				props = declaration.parent.parent;
			}
		}
		if (!props || !ts.isParameter(props)) return null;
		const component = props.parent;
		return component.parameters[0] === props && isFunctionLike(component) ? component : null;
	}

	/**
	 * Whether no code that runs while the module loads can reach `fn` before
	 * its declaration, so it can become a `const`, which is not hoisted. Any
	 * function there may run (an IIFE, a callback, a method an imported call
	 * invokes) except one it only defines: a declaration or a variable's value.
	 * Those run only when called or passed on, which counts as reaching `fn`
	 * for any binding the module declares.
	 */
	declaredBeforeUse(fn: ts.FunctionDeclaration) {
		let safe = true;
		const visit = (node: ts.Node) => {
			if (!safe) return;
			if (isFunctionLike(node) && this.onlyDefines(node)) return;
			if (ts.isIdentifier(node) && node !== fn.name) {
				const declaration = this.declarationOf(node);
				const call = node.parent;
				const handed =
					(ts.isCallExpression(call) || ts.isNewExpression(call)) &&
					(call.expression === node || call.arguments?.includes(node));
				if (
					declaration === fn ||
					(handed && declaration?.getSourceFile() === this.sf && !this.importOf(node))
				) {
					safe = false;
				}
			}
			ts.forEachChild(node, visit);
		};
		for (const statement of this.sf.statements) {
			if (statement === fn) break;
			visit(statement);
		}
		return safe;
	}

	/**
	 * Whether a function is only defined where it stands: a declaration, or a
	 * variable's value, also through `memo` or `forwardRef`, which do not call it.
	 */
	onlyDefines(fn: ts.Node) {
		if (ts.isFunctionDeclaration(fn)) return true;
		let parent = fn.parent;
		while (
			ts.isParenthesizedExpression(parent) ||
			(ts.isCallExpression(parent) &&
				/^(?:memo|forwardRef)$/.test(this.calleeName(parent.expression) ?? ''))
		) {
			parent = parent.parent;
		}
		return ts.isVariableDeclaration(parent);
	}

	/**
	 * Whether an `onChange` a spread passes this element fires per edit in
	 * React: a text field with no `onChange` or `onInput` of its own.
	 */
	takesChange(element: ts.JsxOpeningLikeElement) {
		if (
			!/^(?:input|textarea)$/.test(element.tagName.getText(this.sf)) &&
			!this.isTextFieldComponent(element)
		)
			return false;
		if (attributeOf(element, 'onChange') || attributeOf(element, 'onInput')) return false;
		const type = attributeOf(element, 'type')?.initializer;
		return !type || !ts.isStringLiteral(type) || TEXT_INPUT_TYPES.has(type.text);
	}

	/**
	 * A text field that spreads a component's rest props passes on any
	 * `onChange` in them, which React fires per edit and Octane on commit. Take
	 * it out of the rest and pass it as `onInput`, before the spread, so a
	 * caller's own `onInput` still wins. Only when the rest is read nowhere
	 * else, since those reads would lose it.
	 */
	planRestChange(field: ts.JsxOpeningLikeElement) {
		for (const spread of field.attributes.properties) {
			if (!ts.isJsxSpreadAttribute(spread)) continue;
			// Props whose type has no `onChange` have none to pass on.
			const type = this.projectType(spread.expression)?.type;
			if (type && !(type.flags & ts.TypeFlags.Any) && !type.getProperty('onChange')) continue;
			const expression = skipWrappers(spread.expression);
			let rest = ts.isIdentifier(expression) ? asRest(this.declarationOf(expression)) : null;
			// `const { style, ...native } = props` hands on what `props` holds:
			// follow it to where the component receives `onChange`, so every field
			// spread from it gets it.
			while (rest && !this.namesChange(rest.parent)) {
				const source = this.restSource(rest);
				if (!source) break;
				rest = source;
			}
			// A pattern that names `onChange` leaves none in the rest.
			if (rest && this.namesChange(rest.parent)) continue;
			if (
				rest &&
				!this.checker.resolveName('onChange', spread, ts.SymbolFlags.Value, false) &&
				this.onlySpreadOntoFields(rest)
			) {
				this.restChange.add(rest);
				this.changeSpreads.add(spread);
			} else {
				this.note(
					RULE.nativeChange,
					'warning',
					spread,
					`An \`onChange\` in this spread fires on commit (blur) in Octane, not per edit; pass it to the \`<${field.tagName.getText(this.sf)}>\` as \`onInput\`.`,
				);
			}
		}
	}

	/**
	 * Whether no read of a rest binding but its spreads onto text fields can
	 * see an `onChange` in it: other reads name another member (`props.type`).
	 */
	onlySpreadOntoFields(rest: ts.BindingElement) {
		let only = true;
		const visit = (node: ts.Node) => {
			if (!only) return;
			if (ts.isIdentifier(node) && node !== rest.name && this.declarationOf(node) === rest) {
				let read: ts.Node = node;
				while (isWrapper(read.parent)) read = read.parent;
				const parent = read.parent;
				if (ts.isJsxSpreadAttribute(parent)) {
					only = this.takesChange(parent.parent.parent);
				} else if (
					ts.isVariableDeclaration(parent) &&
					parent.initializer === read &&
					ts.isObjectBindingPattern(parent.name)
				) {
					// A destructuring hands `onChange` on to its own rest, if it has one.
					const inner = asRest(parent.name.elements.find((e) => e.dotDotDotToken) ?? null);
					only = !this.namesChange(parent.name) && (!inner || this.onlySpreadOntoFields(inner));
				} else {
					only =
						ts.isPropertyAccessExpression(parent) &&
						parent.expression === read &&
						parent.name.text !== 'onChange';
				}
			}
			ts.forEachChild(node, visit);
		};
		visit(ts.findAncestor(rest, ts.isFunctionLike) ?? this.sf);
		return only;
	}

	/**
	 * The rest binding a destructuring into `rest`'s pattern reads, or null:
	 * `props` for `native` in `const { style, ...native } = props`.
	 */
	restSource(rest: ts.BindingElement) {
		const declaration = rest.parent.parent;
		if (!ts.isVariableDeclaration(declaration) || !declaration.initializer) return null;
		const source = skipWrappers(declaration.initializer);
		return ts.isIdentifier(source) ? asRest(this.declarationOf(source)) : null;
	}

	/**
	 * Whether a destructuring takes `onChange` out by name.
	 */
	namesChange(pattern: ts.ObjectBindingPattern | ts.ArrayBindingPattern) {
		return pattern.elements.some(
			(e) => ts.isBindingElement(e) && (e.propertyName ?? e.name).getText(this.sf) === 'onChange',
		);
	}

	/**
	 * Whether `element` is a library component that renders a text `<input>`,
	 * such as Base UI's `Input`, imported by name or through a namespace.
	 */
	isTextFieldComponent(element: ts.JsxOpeningLikeElement) {
		let root: ts.Node = element.tagName;
		while (ts.isPropertyAccessExpression(root)) root = root.expression;
		const entry = this.importOf(root);
		if (!entry) return false;
		const [, ...members] = element.tagName.getText(this.sf).split('.');
		const name = (entry.namespace ? members : [entry.imported, ...members]).join('.');
		return TEXT_FIELD_COMPONENTS[entry.module]?.includes(name) ?? false;
	}

	/**
	 * The declaration a name refers to.
	 */
	declarationOf(node: ts.Identifier): ts.Declaration | null {
		const parent = node.parent;
		const symbol =
			ts.isShorthandPropertyAssignment(parent) && parent.name === node
				? this.checker.getShorthandAssignmentValueSymbol(parent)
				: this.checker.getSymbolAtLocation(node);
		return symbol?.declarations?.[0] ?? null;
	}

	/**
	 * The initializer of the `const` a name refers to, or null.
	 */
	constValue(node: ts.Identifier): ts.Expression | null {
		const declaration = this.declarationOf(node);
		if (
			!declaration ||
			!ts.isVariableDeclaration(declaration) ||
			!declaration.initializer ||
			!(ts.getCombinedNodeFlags(declaration) & ts.NodeFlags.Const)
		) {
			return null;
		}
		return declaration.initializer;
	}

	/**
	 * The import a name refers to, or null when it refers to anything else,
	 * such as a local that shadows the import.
	 */
	importOf(node: ts.Node): Import | null {
		if (!ts.isIdentifier(node)) return null;
		const declaration = this.declarationOf(node);
		return declaration ? (this.imports.get(declaration) ?? null) : null;
	}

	/**
	 * The React or Octane export a callee names, through a named import or a
	 * namespace.
	 */
	calleeName(node: ts.Node): string | null {
		return this.callee(node)?.name ?? null;
	}

	reactHook(node: ts.Expression) {
		const callee = this.callee(node);
		return callee?.module === 'react' ? callee.name : null;
	}

	callee(node: ts.Node): { name: string; module: string } | null {
		if (ts.isIdentifier(node)) {
			const entry = this.importOf(node);
			if (!entry || entry.namespace || entry.typeOnly || !isApiModule(entry.module)) return null;
			return { name: entry.imported, module: entry.module };
		}
		if (ts.isPropertyAccessExpression(node)) {
			const entry = this.importOf(node.expression);
			if (!entry?.namespace || !isApiModule(entry.module)) return null;
			return { name: node.name.text, module: entry.module };
		}
		return null;
	}

	line(node: ts.Node) {
		return this.sf.getLineAndCharacterOfPosition(node.getStart(this.sf)).line + 1;
	}

	note(rule: string, severity: Severity, node: ts.Node, message: string) {
		this.notes.push({ rule, severity, line: this.line(node), message });
	}

	count(rule: string) {
		this.rules[rule] = (this.rules[rule] ?? 0) + 1;
	}

	/**
	 * Request an import and return the local name to use.
	 */
	require(module: string, name: string, typeOnly: boolean) {
		let names = this.added.get(module);
		if (!names) this.added.set(module, (names = new Map()));
		const existing = names.get(name);
		if (existing) {
			if (!typeOnly) existing.typeOnly = false;
			return existing.local;
		}
		// A React import of the same name becomes this import.
		const prior = this.apiLocals.get(name);
		const collides =
			(this.declared.has(name) || this.readsGlobal(name)) &&
			!(prior && mapReactImport(prior.module, prior.imported, prior.typeOnly)?.name === name);
		let local = collides ? `Octane${name[0].toUpperCase()}${name.slice(1)}` : name;
		while (collides && (this.declared.has(local) || this.readsGlobal(local))) local += '_';
		names.set(name, { local, typeOnly });
		return local;
	}

	/**
	 * Whether this module declares `symbol`, rather than the library or
	 * nothing at all.
	 */
	declaresHere(symbol: ts.Symbol | undefined) {
		return symbol?.declarations?.some((d) => d.getSourceFile() === this.sf) ?? false;
	}

	/**
	 * Whether the module reads `name` as a global, such as the DOM's
	 * `MouseEvent`, which an import of the same name would shadow.
	 */
	readsGlobal(name: string) {
		const visit: (node: ts.Node) => boolean = (node) => {
			if (
				ts.isIdentifier(node) &&
				node.text === name &&
				!isPropertyName(node) &&
				!declaresName(node) &&
				!this.declaresHere(this.checker.getSymbolAtLocation(node))
			) {
				return true;
			}
			return ts.forEachChild(node, visit) ?? false;
		};
		return visit(this.sf) === true;
	}

	// ---------------------------------------------------------------- emission

	/**
	 * The new text of `node`: a rule's replacement, or the original text with
	 * its children emitted in place.
	 */
	emit(node: ts.Node, ctx: Context, start?: number): string {
		if (ts.isIdentifier(node) && this.apiLocals.has(node.text) && !this.inImport(node)) {
			const entry = this.importOf(node);
			if (entry) {
				this.used.add(entry.local);
				if (!inTypeNode(node)) this.valueUses.add(entry.local);
			}
		}
		const replaced = this.rewrite(node, ctx);
		if (replaced !== null) return replaced;
		const text = this.span(node, start ?? node.getStart(this.sf), node.end, ctx);
		if (this.effectSnapshots && ts.isExpressionStatement(node)) {
			const declarations = this.effectSnapshots.get(node);
			if (declarations) {
				const indent = this.indentOf(node);
				const line = '\n' + indent + this.indentUnit;
				return '{' + line + declarations.join(line) + line + text + '\n' + indent + '}';
			}
		}
		if ((ts.isStringLiteral(node) || ts.isTemplateLiteral(node)) && text.includes('\n')) {
			return text.replaceAll('\n', LITERAL_NEWLINE);
		}
		return text;
	}

	inImport(node: ts.Node) {
		for (let current = node.parent; current; current = current.parent) {
			if (ts.isImportDeclaration(current)) return true;
		}
		return false;
	}

	/**
	 * The text of `node` between `from` and `to`, with every child inside that
	 * range emitted.
	 */
	span(node: ts.Node, from: number, to: number, ctx: Context) {
		let out = '';
		let cursor = from;
		const jsx = ts.isJsxElement(node) || ts.isJsxFragment(node);
		const childCtx = jsx ? ctx : PLAIN;
		// JSX in a value position (including a child's initializer) exposes its
		// prop names to element inspection before it ever renders as a host node.
		const descriptor =
			ctx.descriptor || (!ctx.template && (jsx || ts.isJsxSelfClosingElement(node)));
		node.forEachChild((child) => {
			if (child.pos === child.end) return;
			const start = child.getStart(this.sf);
			if (start < from || child.end > to) return;
			out += this.source.slice(cursor, start);
			if (ts.isJsxAttributes(child) && child.properties.every((a) => this.removed.has(a))) {
				out = out.replace(/[ \t]+$/, '');
				cursor = child.end;
				return;
			}
			const jsxChild =
				ts.isJsxElement(child) ||
				ts.isJsxSelfClosingElement(child) ||
				ts.isJsxFragment(child) ||
				ts.isJsxExpression(child) ||
				ts.isJsxText(child);
			out += this.emit(child, descriptor ? DESCRIPTOR : jsxChild ? childCtx : PLAIN);
			cursor = child.end;
		});
		return out + this.source.slice(cursor, to);
	}

	rewrite(node: ts.Node, ctx: Context): string | null {
		if (this.linkedStateEdits && ts.isStatement(node)) {
			const linked = this.linkedStateEdits.get(node);
			if (linked) return linked;
		}
		if (this.strong && this.target === 'tsrx' && ts.isVariableStatement(node)) {
			const state = this.nativeRefState(node);
			if (state) return state;
		}
		const effectEdit = this.effectEdits?.get(node);
		if (effectEdit)
			return ts.isCallExpression(node)
				? effectEdit + this.span(node, node.expression.end, node.end, ctx)
				: effectEdit;
		const stored = ts.isArrowFunction(node) ? this.snapshotCaptures?.get(node) : undefined;
		const aliases = this.effectAliases;
		if (aliases || stored) {
			if (aliases && (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node))) {
				const alias = aliases.get(node);
				if (alias) return alias;
			}
			if (ts.isArrowFunction(node)) {
				const snapshots = ts.isBlock(node.body) ? this.effectSnapshots : undefined;
				const importedEvent = snapshots && this.apiLocals.get('useEffectEvent');
				const canBridgeLayout =
					snapshots &&
					(!importedEvent ||
						this.checker
							.resolveName(
								'useEffectEvent',
								node.parent,
								ts.SymbolFlags.Value | ts.SymbolFlags.Alias,
								false,
							)
							?.declarations?.some(
								(declaration) => this.imports.get(declaration) === importedEvent,
							));
				let layoutEvent = false;
				const captures = aliases
					? effectReceivers(
							node,
							this.checker,
							(name) => this.reactHook(name),
							aliases,
							snapshots &&
								((statement, member, name) => {
									if (aliases.has(member)) return;
									const declarations = snapshots.get(statement) ?? [];
									declarations.push(`const ${name} = ${this.emit(member, PLAIN)};`);
									snapshots.set(statement, declarations);
									aliases.set(member, name);
								}),
							canBridgeLayout
								? (statement, name) => {
										const event = this.require('octane', 'useEffectEvent', false);
										const setup = this.span(node, node.getStart(this.sf), node.end, ctx);
										snapshots.get(statement)!.push(`const ${name} = ${event}(${setup});`);
										layoutEvent = true;
									}
								: undefined,
						)
					: [];
				for (const statement of this.effectHelperCaptures?.get(node) ?? []) {
					const declaration = this.span(
						statement,
						statement.getStart(this.sf),
						statement.end,
						PLAIN,
					);
					captures.push(declaration.endsWith(';') ? declaration : declaration + ';');
				}
				if (stored) captures.unshift(...stored);
				if (captures.length) {
					const { body } = node;
					const block = ts.isBlock(body);
					const bodyStart = body.getStart(this.sf);
					const start = block ? bodyStart : body.pos;
					const indent = this.indentOf(block ? body : node);
					const line = '\n' + indent + this.indentUnit;
					if (layoutEvent) return '() => {' + line + captures.join(line) + '\n' + indent + '}';
					const head = this.span(node, node.getStart(this.sf), start, ctx);
					let rest: string;
					if (block) {
						rest = this.span(body, start + 1, body.end, ctx);
					} else {
						const trivia = this.source.slice(start, bodyStart).trimStart();
						const value = this.emit(body, ctx);
						const expression = trivia ? `(${trivia}${value})` : value;
						rest = `return ${expression};\n${indent}}`;
					}
					return (
						head +
						(block ? '{' : ' {') +
						line +
						captures.join(line) +
						(/^\s*\n/.test(rest) ? '' : line) +
						rest
					);
				}
			}
		}
		if (ts.isImportDeclaration(node)) return this.rewriteImport(node);
		if (ts.isExportDeclaration(node) && node.moduleSpecifier) return this.rewriteReexport(node);
		if (ts.isCallExpression(node)) return this.rewriteCall(node);
		if (ts.isPropertyAccessExpression(node)) {
			const text = this.rewriteMember(node);
			if (text === null) this.checkProjectReactEventMember(node, node.name.text);
			return text;
		}
		if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression))
			this.checkProjectReactEventMember(node, node.argumentExpression.text);
		if (ts.isQualifiedName(node)) return this.rewriteQualifiedType(node);
		if (ts.isImportTypeNode(node)) return this.rewriteImportType(node);
		if (ts.isTypeReferenceNode(node)) return this.rewriteTypeReference(node, node.typeName);
		if (ts.isExpressionWithTypeArguments(node) && ts.isHeritageClause(node.parent))
			return this.rewriteTypeReference(node, node.expression);
		if (ts.isExpressionStatement(node)) return this.rewriteStatement(node);
		if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) this.checkClass(node);
		if (ts.isBinaryExpression(node)) {
			const guarded = this.rewriteRenderProp(node);
			if (guarded !== null) return guarded;
			this.checkDefaultProps(node);
		}
		if (ts.isModuleDeclaration(node) && ts.isStringLiteral(node.name)) {
			return node.name.text in REACT_MODULES
				? this.rewriteAugmentation(node, node.name)
				: this.rewriteSpecifier(node, node.name);
		}
		if (ts.isBindingElement(node) && this.restChange.has(node)) {
			return 'onChange, ' + node.getText(this.sf);
		}
		if (ts.isVariableDeclaration(node) && this.descriptorComponents.has(node) && node.initializer) {
			this.count(RULE.descriptorChildren);
			return (
				this.span(node, node.getStart(this.sf), node.initializer.getStart(this.sf), PLAIN) +
				`${this.require('octane', 'descriptorChildren', false)}(${this.emit(node.initializer, PLAIN)})`
			);
		}
		if (ts.isJsxText(node) && this.target === 'tsrx' && /\/[/*]/.test(node.text)) {
			// TSRX reads `//` and `/*` in element text as comments, as JavaScript does.
			return node.getText(this.sf).replace(/\/(?=[/*])/g, "{'/'}");
		}
		if (
			ts.isIdentifier(node) &&
			this.routerShell &&
			Object.hasOwn(DOCUMENT_TAGS, node.text) &&
			(ts.isJsxOpeningElement(node.parent) ||
				ts.isJsxClosingElement(node.parent) ||
				ts.isJsxSelfClosingElement(node.parent)) &&
			node.parent.tagName === node
		) {
			// The router's document components own the hydration root.
			if (!ts.isJsxClosingElement(node.parent)) this.count(RULE.documentShell);
			return this.require('@octanejs/tanstack-router', DOCUMENT_TAGS[node.text], false);
		}
		const reactArgs = this.reactRendererBodies.get(node);
		if (reactArgs !== undefined)
			return this.require('react/jsx-runtime', 'jsx', false) + '(' + reactArgs + ')';
		if (ts.isJsxAttributes(node)) return this.rewriteAttributes(node, ctx);
		if ((ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) && this.islands.has(node)) {
			this.count(RULE.reactCompat);
			const island = this.require('octane/react', this.islands.get(node)!, false);
			const content = this.span(node, node.getStart(this.sf), node.end, PLAIN);
			const tag = ts.isJsxElement(node) ? node.openingElement.tagName : node.tagName;
			const imported = this.importOf(ts.isPropertyAccessExpression(tag) ? tag.expression : tag);
			const name = ts.isPropertyAccessExpression(tag) ? tag.name.text : imported?.imported;
			if (
				this.options.reactIntlAdapter &&
				imported?.module === 'react-intl' &&
				INTL_FORMATTER.test(name ?? '')
			) {
				const boundary = this.require(this.options.reactIntlAdapter, 'IntlBoundary', false);
				const contexts = this.require(this.options.reactIntlAdapter, 'intlContexts', false);
				this.count('react-intl');
				return `<${boundary}><${island} contexts={${contexts}}>${content}</${island}></${boundary}>`;
			}
			return `<${island}>${content}</${island}>`;
		}
		// An earlier run's wrapper goes: each run decides again whether its
		// element throws or renders in an island.
		if (ts.isJsxElement(node) && node.openingElement.tagName.getText(this.sf) === NO_PORT) {
			const element = node.children.find(
				(child) => ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child),
			);
			if (element) return this.emit(element, ctx);
		}
		const error = this.unrenderable.get(node);
		if (error !== undefined) {
			const element =
				(ts.isJsxElement(node) ? this.rewriteElement(node, ctx) : null) ??
				this.span(node, node.getStart(this.sf), node.end, ctx);
			return `<${NO_PORT} error="${error}">${element}</${NO_PORT}>`;
		}
		if (ts.isJsxElement(node)) return this.rewriteElement(node, ctx);
		if (ts.isJsxExpression(node) && ctx.template) return this.rewriteHole(node);
		// So does its `NoOctanePort`, which `run` adds back while one still throws.
		if (ts.isFunctionDeclaration(node) && node.name?.text === NO_PORT) return DROP;
		if (
			ts.isFunctionDeclaration(node) ||
			ts.isFunctionExpression(node) ||
			ts.isArrowFunction(node)
		) {
			const component = this.target === 'tsrx' ? this.rewriteComponent(node) : null;
			if (component !== null) this.checkElementChildren(node);
			const text =
				component ??
				(this.parameters.has(node) && node.body
					? this.head(node, node.body.getStart(this.sf)) + this.emit(node.body, PLAIN)
					: null);
			if (!ts.isFunctionDeclaration(node) || !this.descriptorComponents.has(node)) return text;
			// A marked binding is a `const`; the function keeps its name.
			this.count(RULE.descriptorChildren);
			const fn = (text ?? this.span(node, node.getStart(this.sf), node.end, ctx)).replace(
				/^export\s+/,
				'',
			);
			const exported = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
			return `${exported ? 'export ' : ''}const ${node.name?.text} = ${this.require('octane', 'descriptorChildren', false)}(${fn});`;
		}
		return null;
	}

	// ---------------------------------------------------------------- imports

	rewriteImport(node: ts.ImportDeclaration) {
		const native = this.pathSvgImports.get(node);
		if (native) {
			const spec = node.moduleSpecifier;
			return (
				this.source.slice(node.getStart(this.sf), spec.getStart(this.sf)) +
				JSON.stringify(native) +
				this.source.slice(spec.end, node.end)
			);
		}
		const module = (node.moduleSpecifier as ts.StringLiteral).text;
		if (module === 'octane') return null;
		if (module === '@react-three/fiber' && this.hasJsx) {
			this.note(
				RULE.unsupported,
				'error',
				node,
				"Three.js elements compile only in a `.three.tsrx` module, Octane's three renderer: move the scene components there and mount them with `root.render(Scene, props)`.",
			);
		}
		if (module in REACT_MODULES) {
			this.importSlots.push(node);
			return `\u0000IMPORT${this.importSlots.length - 1}\u0000`;
		}
		const clause = node.importClause;
		const bindings = clause?.namedBindings;
		if (
			bindings &&
			ts.isNamespaceImport(bindings) &&
			this.radixSlotImports?.get(bindings.name) === 'original'
		)
			return null;
		if (clause && bindings && ts.isNamedImports(bindings)) {
			const moved = new Map<string, string[]>();
			const kept: ts.ImportSpecifier[] = [];
			const originals: string[] = [];
			let store = false;
			let intl = false;
			for (const item of bindings.elements) {
				const alias = this.originalStoreTags.get(item);
				if (alias)
					originals.push(`${(item.propertyName ?? item.name).getText(this.sf)} as ${alias}`);
				const hook = this.nativeStoreHooks.get(item);
				let dest =
					hook?.from ?? (this.nativeIntl.has(item) ? this.options.reactIntlAdapter : undefined);
				if (!dest) {
					const name = (item.propertyName ?? item.name).text;
					if (
						this.options.localReactHook &&
						!node.attributes &&
						!clause.isTypeOnly &&
						!item.isTypeOnly &&
						/^use[A-Z0-9]/.test(name)
					) {
						const refs = renderUses(this.localUses(item.name));
						const sites = refs.map((ref) => nativeSetupHook(ref, this.localUses, this.checker));
						// Relative imports use the compiler's custom slot-keyed hook naming rule.
						const slotKeyed = [name, item.name.text].every(
							(spelling) => /^use[A-Z]/.test(spelling) && spelling !== 'useContext',
						);
						const nativeOnly =
							sites.length > 0 &&
							sites.every(Boolean) &&
							(!sites.includes('afterRefs') || this.options.originalReact === true);
						const setup = {
							calleeName: (callee: ts.Expression) => this.calleeName(callee),
							nativeOutput: (element: ts.JsxElement | ts.JsxSelfClosingElement) =>
								this.nativeOutput(element, this.localUses),
						};
						const call =
							refs[sites.indexOf('first')] ??
							(nativeOnly
								? refs[0]
								: refs.find((ref) => nativeSetupHook(ref, this.localUses, this.checker, setup)));
						const site =
							call ??
							refs.find((ref) =>
								nativeSetupHook(ref, this.localUses, this.checker, {
									...setup,
									contextSetup: true,
								}),
							);
						const local =
							site && this.options.localReactHook(module, name, !!call && slotKeyed && nativeOnly);
						if (call && local && typeof local !== 'string') {
							dest = local.from;
							this.count('native-external-store');
						} else if (site && typeof local === 'string' && (call || local === 'useContext'))
							this.note(
								RULE.bindings,
								'error',
								site,
								`The unchanged ${module} export ${name} calls React's ${local}. Provide a compiled Octane hook for native callers or keep this component under a React renderer.`,
							);
					}
					if (!dest) {
						kept.push(item);
						continue;
					}
				}
				store ||= !!hook;
				intl ||= this.nativeIntl.has(item);
				const names = moved.get(dest) ?? [];
				names.push(
					hook && hook.name !== (item.propertyName ?? item.name).text
						? hook.name === item.name.text
							? hook.name
							: `${hook.name} as ${item.name.text}`
						: item.getText(this.sf),
				);
				moved.set(dest, names);
			}
			if (moved.size) {
				const remaining = [...kept.map((x) => x.getText(this.sf)), ...originals];
				const original = [
					clause.name?.text,
					remaining.length ? `{ ${remaining.join(', ')} }` : undefined,
				]
					.filter(Boolean)
					.join(', ');
				const specifier = node.moduleSpecifier.getText(this.sf);
				const lines: string[] = [];
				if (original) lines.push(`import ${original} from ${specifier};`);
				// A workspace package's public entry may also initialize its store.
				if (store && !clause.name && kept.every((item) => item.isTypeOnly))
					lines.push(`import ${specifier};`);
				for (const [dest, names] of moved)
					lines.push(`import { ${names.join(', ')} } from ${this.quote}${dest}${this.quote};`);
				if (store) this.count('store-hook');
				else if (intl) this.count('react-intl');
				return lines.join('\n');
			}
		}
		const text =
			this.rewritePackageNames(node, module) ?? this.rewriteSpecifier(node, node.moduleSpecifier);
		// Analysis recorded the packages this module imports values from.
		const port = node.importClause?.isTypeOnly === false ? (this.ports.get(module) ?? null) : null;
		if (
			!port ||
			ts
				.getLeadingCommentRanges(this.source, node.pos)
				?.some((range) => this.source.slice(range.pos, range.end).includes('No Octane port of'))
		)
			return text;
		return `// ${portComment(port)}\n${text ?? node.getText(this.sf)}`;
	}

	/**
	 * An import or re-export of a ported package whose port spells some of its
	 * names differently. A Radix package is a namespace of `@octanejs/radix`, so
	 * its namespace import becomes that namespace and its named imports read
	 * from it. Names the port lacks stay on the React package, for a person.
	 */
	rewritePackageNames(node: ts.ImportDeclaration | ts.ExportDeclaration, module: string) {
		const clause = ts.isImportDeclaration(node) ? node.importClause : node;
		const namespace = radixNamespace(module);
		const next = this.resolve(module);
		// A default import; and a Radix package's re-export, which rewriteSpecifier reports.
		if (!clause || next === null || (ts.isImportClause(clause) ? clause.name : namespace)) {
			return null;
		}
		const keyword = ts.isImportClause(clause) ? 'import' : 'export';
		const quote = this.source[(node.moduleSpecifier as ts.Expression).getStart(this.sf)];
		const from = (specifier: string) => `from ${quote}${specifier}${quote};`;
		const type = clause.isTypeOnly ? 'type ' : '';
		const bindings = ts.isImportClause(clause) ? clause.namedBindings : clause.exportClause;
		if (bindings && ts.isNamespaceImport(bindings)) {
			if (namespace === null) return null;
			const local = bindings.name.text;
			this.count(RULE.import);
			return `import ${type}{ ${local === namespace ? local : `${namespace} as ${local}`} } ${from(next)}`;
		}
		if (!bindings || ts.isNamespaceExport(bindings)) return null;
		const kept: string[] = [];
		const values: string[] = [];
		const types: string[] = [];
		let renamed = false;
		for (const element of bindings.elements) {
			const imported = (element.propertyName ?? element.name).text;
			const local = element.name.text;
			if (module === 'radix-ui' && imported === 'Slot' && next === '@octanejs/radix') {
				if (!ts.isImportSpecifier(element)) {
					this.note(
						RULE.binding,
						'error',
						element,
						'The Octane binding has no Radix Slot namespace to re-export.',
					);
					kept.push(element.getText(this.sf));
					continue;
				}
				const plan = this.radixSlotImports?.get(element.name);
				if (plan === 'original') {
					kept.push(element.getText(this.sf));
				} else if (plan === 'native') {
					values.push(element.getText(this.sf));
				} else {
					renamed = true;
				}
				continue;
			}
			const name = mapPackageExport(module, imported);
			if (name === null) {
				this.note(RULE.binding, 'error', element, missingExport(module, imported));
				kept.push(element.getText(this.sf));
				continue;
			}
			renamed ||= name !== imported;
			if (namespace === null) {
				values.push(
					`${element.isTypeOnly ? 'type ' : ''}${name === local ? name : `${name} as ${local}`}`,
				);
			} else if (RADIX_TYPES.has(name)) {
				types.push(`type ${local} = ${this.require(next, namespace, true)}.${name};`);
			} else {
				values.push(name === local ? name : `${name}: ${local}`);
			}
		}
		if (namespace === null && kept.length === 0 && !renamed) return null;
		this.count(RULE.import);
		const lines =
			kept.length > 0 ? [`${keyword} ${type}{ ${kept.join(', ')} } ${from(module)}`] : [];
		if (values.length > 0) {
			lines.push(
				namespace === null
					? `${keyword} ${type}{ ${values.join(', ')} } ${from(next)}`
					: `const { ${values.join(', ')} } = ${this.require(next, namespace, false)};`,
			);
		}
		return [...lines, ...types].join('\n');
	}

	/**
	 * `DialogPrimitive.DialogTitle`, a member of a ported package's namespace
	 * import, as its port spells it.
	 *
	 * @param severity of a member the port lacks
	 */
	rewritePackageMember(namespace: ts.Node, member: ts.MemberName, severity: Severity) {
		const slot = this.radixSlotMembers?.get(member);
		if (slot) {
			this.count(RULE.import);
			return (
				slot.replacement ??
				this.require('@octanejs/radix', slot.name, ts.isQualifiedName(member.parent))
			);
		}
		const entry = this.importOf(namespace);
		if (!entry?.namespace) return null;
		const name = mapPackageExport(entry.module, member.text);
		if (name === member.text || this.resolve(entry.module) === null) return null;
		if (name === null) {
			if (!ts.isJsxClosingElement(member.parent.parent)) {
				this.note(RULE.binding, severity, member, missingExport(entry.module, member.text));
			}
			return null;
		}
		this.count(RULE.import);
		return `${entry.local}.${name}`;
	}

	rewriteReexport(node: ts.ExportDeclaration) {
		const specifier = node.moduleSpecifier as ts.StringLiteral;
		const module = specifier.text;
		const exports = node.exportClause;
		if (module === 'react' && exports && ts.isNamedExports(exports)) {
			const retained: string[] = [];
			const migrated: string[] = [];
			for (const [index, item] of exports.elements.entries()) {
				const text = this.source.slice(
					item.getFullStart(),
					exports.elements[index + 1]?.getFullStart() ?? exports.end - 1,
				);
				const name = (item.propertyName ?? item.name).text;
				if (mapReactImport(module, name, node.isTypeOnly || item.isTypeOnly)?.module === module) {
					retained.push(text);
					continue;
				}
				if (
					name === 'SubmitEvent' ||
					name === 'SubmitEventHandler' ||
					name === 'ReactEventHandler'
				) {
					retained.push(text);
					this.note(
						RULE.unsupported,
						'error',
						item,
						'Review the React event re-export and define an explicit native event type.',
					);
				} else {
					migrated.push(text);
				}
			}
			if (retained.length) {
				if (!migrated.length) return null;
				this.count(RULE.import);
				const start = this.source.slice(node.getStart(this.sf), exports.getStart(this.sf) + 1);
				const end = this.source.slice(exports.end - 1, specifier.getStart(this.sf));
				const tail = this.source.slice(specifier.end, node.end);
				const quote = this.source[specifier.getStart(this.sf)];
				const statement = (items: string[], from: string) =>
					start + items.join('') + end + quote + from + quote + tail;
				return statement(retained, module) + '\n' + statement(migrated, 'octane');
			}
		}
		const mapped = REACT_MODULES[module];
		if (mapped) {
			this.count(RULE.import);
			return this.replaceSpecifier(node, specifier, mapped);
		}
		return this.rewritePackageNames(node, module) ?? this.rewriteSpecifier(node, specifier);
	}

	rewriteSpecifier(node: ts.Node, specifier: ts.Expression) {
		if (!ts.isStringLiteral(specifier)) return null;
		const next = this.resolve(specifier.text);
		if (next === null || next === specifier.text) return null;
		const namespace = radixNamespace(specifier.text);
		if (namespace !== null) {
			// A re-export, `import()`, or type of the package would be the whole binding.
			this.note(
				RULE.binding,
				'error',
				node,
				`\`@octanejs/radix\` serves \`${specifier.text}\` as its \`${namespace}\` namespace; read it from \`import { ${namespace} } from '@octanejs/radix'\`.`,
			);
			return null;
		}
		if (specifier.text === 'radix-ui' && next === '@octanejs/radix') {
			let qualifier = ts.isImportTypeNode(node) ? node.qualifier : undefined;
			while (qualifier && ts.isQualifiedName(qualifier)) qualifier = qualifier.left;
			if (
				ts.isCallExpression(node) ||
				(ts.isExportDeclaration(node) &&
					(!node.exportClause || ts.isNamespaceExport(node.exportClause))) ||
				(ts.isImportTypeNode(node) && (!qualifier || qualifier.text === 'Slot'))
			) {
				this.note(
					RULE.binding,
					'error',
					node,
					'The Octane binding has no equivalent Radix Slot namespace. Import specific components instead.',
				);
				return null;
			}
		}
		this.count(RULE.import);
		return this.replaceSpecifier(node, specifier, next);
	}

	/**
	 * The new spelling of an import specifier, or null to keep it.
	 */
	resolve(specifier: string) {
		let next = this.resolved.get(specifier);
		if (next === undefined) {
			next = this.options.resolveSpecifier?.(specifier) ?? null;
			this.resolved.set(specifier, next);
		}
		return next;
	}

	/**
	 * `declare module 'react' { namespace JSX { … } }` types custom elements,
	 * which Octane reads from `octane/jsx-runtime`'s JSX namespace. Anything
	 * else it adds patches React's own types, which Octane does not use.
	 */
	rewriteAugmentation(node: ts.ModuleDeclaration, specifier: ts.StringLiteral) {
		const statements = node.body && ts.isModuleBlock(node.body) ? node.body.statements : [];
		if (
			statements.length > 0 &&
			statements.every((s) => ts.isModuleDeclaration(s) && s.name.getText(this.sf) === 'JSX')
		) {
			this.count(RULE.import);
			this.augments = true;
			return this.replaceSpecifier(node, specifier, 'octane/jsx-runtime');
		}
		this.note(
			RULE.unsupported,
			'warning',
			node,
			`This augments React's own types, which Octane does not read; add what it declares to Octane's.`,
		);
		return null;
	}

	replaceSpecifier(node: ts.Node, specifier: ts.Expression, next: string) {
		const quote = this.source[specifier.getStart(this.sf)];
		return (
			this.span(node, node.getStart(this.sf), specifier.getStart(this.sf), PLAIN) +
			quote +
			next +
			quote +
			// The rest is emitted, not copied: `import('./x').T<import('react').U>`
			// has a nested specifier of its own.
			this.span(node, specifier.end, node.end, PLAIN)
		);
	}

	/**
	 * `import('react').ReactNode` in a type: the module, and a React type name
	 * Octane spells differently, follow the same map as static imports.
	 */
	rewriteImportType(node: ts.ImportTypeNode) {
		const argument = node.argument;
		if (!ts.isLiteralTypeNode(argument) || !ts.isStringLiteral(argument.literal)) return null;
		const specifier = argument.literal;
		const module = REACT_MODULES[specifier.text];
		if (module === undefined) return this.rewriteSpecifier(node, specifier);
		const qualifier = node.qualifier;
		const name = qualifier && ts.isIdentifier(qualifier) ? qualifier.text : null;
		if (
			node.isTypeOf &&
			name &&
			mapReactImport(specifier.text, name, true)?.module === specifier.text
		) {
			return null;
		}
		if (specifier.text === 'react' && !node.isTypeOf) {
			const event = this.nativeEventType(node, name);
			if (event !== undefined) {
				if (event !== null) this.count(RULE.import);
				return event;
			}
		}
		this.count(RULE.import);
		const renamed = name === null ? null : mapQualifiedType(name);
		if (name !== null && renamed === null) {
			this.note(RULE.unsupported, 'warning', node, `Octane has no type \`${name}\`.`);
		}
		const quote = this.source[specifier.getStart(this.sf)];
		const head =
			this.span(node, node.getStart(this.sf), specifier.getStart(this.sf), PLAIN) +
			quote +
			module +
			quote;
		if (!qualifier || renamed === null || renamed === name) {
			const type = head + this.span(node, specifier.end, node.end, PLAIN);
			return specifier.text === 'react' && !node.isTypeOf && this.isIntrinsicProps(node, name)
				? this.wrapIntrinsicProps(node, type)
				: type;
		}
		return (
			head +
			this.source.slice(specifier.end, qualifier.getStart(this.sf)) +
			renamed +
			this.span(node, qualifier.end, node.end, PLAIN)
		);
	}

	/**
	 * Fill each React import placeholder. The first one carries every Octane
	 * import the module needs, the module's own specifiers first; the others
	 * disappear with their line.
	 */
	finishImports(code: string) {
		const imports: Map<
			string,
			Map<string, { name: string; local: string; typeOnly: boolean }>
		> = new Map();
		const add = (module: string, name: string, local: string, typeOnly: boolean) => {
			let names = imports.get(module);
			if (!names) imports.set(module, (names = new Map()));
			const existing = names.get(`${name} ${local}`);
			if (existing) existing.typeOnly &&= typeOnly;
			else names.set(`${name} ${local}`, { name, local, typeOnly });
		};
		/** React specifiers with no Octane export stay on React, for a person. */
		const kept = new Map<string, string[]>();
		/** Locals of React's `jsx` factories, which a JSX runtime consumer calls. */
		const factories: string[] = [];
		for (const node of this.importSlots) {
			const module = (node.moduleSpecifier as ts.StringLiteral).text;
			const clause = node.importClause;
			if (!clause) continue;
			const bindings = clause.namedBindings;
			const namespace =
				clause.name?.text ??
				(bindings && ts.isNamespaceImport(bindings) ? bindings.name.text : null);
			// Members the rewrite could not map keep the namespace alive.
			if (namespace && this.used.has(namespace)) add(REACT_MODULES[module], '*', namespace, false);
			if (!bindings || !ts.isNamedImports(bindings)) continue;
			for (const element of bindings.elements) {
				const local = element.name.text;
				if (!this.used.has(local)) continue;
				const imported = (element.propertyName ?? element.name).text;
				const typeOnly = clause.isTypeOnly || element.isTypeOnly;
				const mapped = mapReactImport(module, imported, typeOnly);
				if (mapped) {
					// A name read only in types imports as a type, which bundlers elide.
					add(mapped.module, mapped.name, local, typeOnly || !this.valueUses.has(local));
					continue;
				}
				if (/^react\/jsx-(?:dev-)?runtime$/.test(module) && /^jsx(?:s|DEV)?$/.test(imported)) {
					add('octane', 'createElement', 'createElement', false);
					factories.push(local);
					continue;
				}
				this.note(
					RULE.unsupported,
					'error',
					element,
					UNSUPPORTED_VALUES[imported] ??
						`\`${imported}\` from '${module}' has no Octane equivalent.`,
				);
				const spec =
					(typeOnly ? 'type ' : '') + (imported === local ? local : `${imported} as ${local}`);
				kept.set(module, [...(kept.get(module) ?? []), spec]);
			}
		}
		for (const [module, names] of this.added) {
			for (const [name, { local, typeOnly }] of names) add(module, name, local, typeOnly);
		}

		const lines: string[] = [];
		const quote = (module: string) => this.quote + module + this.quote;
		for (const [module, names] of imports) {
			const specs = [...names.values()];
			for (const { name, local } of specs) {
				if (name === '*') lines.push(`import * as ${local} from ${quote(module)};`);
			}
			const named = specs.filter(({ name }) => name !== '*');
			if (named.length === 0) continue;
			const allTypes = named.every(({ typeOnly }) => typeOnly);
			const list = named.map(
				({ name, local, typeOnly }) =>
					(typeOnly && !allTypes ? 'type ' : '') + (name === local ? name : `${name} as ${local}`),
			);
			lines.push(`import ${allTypes ? 'type ' : ''}{ ${list.join(', ')} } from ${quote(module)};`);
		}
		for (const [module, specs] of kept)
			lines.push(`import { ${specs.join(', ')} } from ${quote(module)};`);
		if (factories.length > 0) {
			// React's runtime takes the key apart from the props; Octane's
			// `createElement` reads it from them.
			const params = this.isTypeScript()
				? 'type: Parameters<typeof createElement>[0], props: Record<string, unknown>, key?: string | number'
				: 'type, props, key';
			const [first, ...rest] = factories;
			lines.push(
				`function ${first}(${params}) {`,
				`${this.indentUnit}return createElement(type, key === undefined ? props : { ...props, key });`,
				'}',
				...rest.map((local) => `const ${local} = ${first};`),
			);
		}

		if (this.intrinsicPropsHelper) {
			lines.push(
				`type ${this.intrinsicPropsHelper}<Props> = {`,
				`${this.indentUnit}[K in keyof Props]: K extends 'className' ? string | undefined`,
				`${this.indentUnit}${this.indentUnit}: K extends 'style' ? import(${quote('octane')}).CSSProperties | undefined : Props[K];`,
				'};',
			);
		}

		// In a script, `declare module` declares the module instead of adding to
		// it: a module whose only import was `import 'react'` stays a module, and
		// a script with a retargeted augmentation becomes one.
		if (
			lines.length === 0 &&
			(this.importSlots.length > 0 || this.augments) &&
			!this.otherModuleSyntax()
		) {
			lines.push('export {};');
		}
		if (this.importSlots.length === 0) {
			if (lines.length === 0) return code;
			const at = this.insertionPoint(code);
			return code.slice(0, at) + lines.join('\n') + '\n' + code.slice(at);
		}
		this.count(RULE.import);
		return code.replace(
			/\u0000IMPORT(\d+)\u0000(\r?\n)?/g,
			(_, index: string, newline: string | undefined) =>
				index === '0' && lines.length > 0 ? lines.join('\n') + (newline ?? '') : '',
		);
	}

	/** Whether the module has an import or export besides its React imports. */
	otherModuleSyntax() {
		return this.sf.statements.some(
			(statement) =>
				(ts.isImportDeclaration(statement) && !this.importSlots.includes(statement)) ||
				ts.isImportEqualsDeclaration(statement) ||
				ts.isExportDeclaration(statement) ||
				ts.isExportAssignment(statement) ||
				(ts.canHaveModifiers(statement) &&
					ts.getModifiers(statement)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)),
		);
	}

	/**
	 * Where new imports go when the module imported nothing from React: after
	 * the directive prologue and any leading comments.
	 */
	insertionPoint(code: string) {
		// Whole lines only: a shebang, blank lines, comments that end their
		// line, and directive lines. Anything inserted here starts a line, so
		// the Strong fallback can find its own directive line again. The
		// comment on an unported package's import stays with it.
		const prologue =
			/^(?:#![^\n]*\n)?(?:[ \t]*(?:\/\/(?! No Octane port of)[^\n]*|\/\*[\s\S]*?\*\/[ \t]*|(['"])use [a-z ]+\1;?[^\n]*)?\r?\n)*/.exec(
				code,
			);
		return prologue ? prologue[0].length : 0;
	}

	addStrongDirective(code: string) {
		this.count(RULE.strong);
		const at = this.insertionPoint(code);
		return code.slice(0, at) + '"use strong";\n' + (at === 0 ? '\n' : '') + code.slice(at);
	}

	addJsxPragma(code: string) {
		if (/@jsxImportSource\s+octane/.test(code)) return code;
		const replaced = code.replace(/@jsxImportSource\s+\S+/, '@jsxImportSource octane');
		return replaced !== code ? replaced : '/** @jsxImportSource octane */\n' + code;
	}

	// ---------------------------------------------------------------- APIs

	rewriteMember(node: ts.PropertyAccessExpression) {
		// `<Ctx.Provider value>` is `<Ctx value>` in Octane, as in React 19.
		const tag = node.parent;
		const isTag =
			(ts.isJsxOpeningElement(tag) ||
				ts.isJsxClosingElement(tag) ||
				ts.isJsxSelfClosingElement(tag)) &&
			tag.tagName === node;
		if (isTag && this.hasReactBridge && this.reactCompatTag(tag.tagName)) {
			// The project compiler recognizes named imports when transporting descriptor children.
			return this.require(this.importOf(node.expression)!.module, node.name.text, false);
		}
		// So is `const P = C.Provider`; a member of the provider (`C.Provider.x`)
		// or a write to it stays.
		const isValue =
			!isTag &&
			!(ts.isPropertyAccessExpression(tag) && tag.expression === node) &&
			!(ts.isBinaryExpression(tag) && tag.left === node);
		if (node.name.text === 'Provider' && (isTag || isValue) && this.isContext(node.expression)) {
			if (!ts.isJsxClosingElement(tag)) this.count(RULE.provider);
			return this.emit(node.expression, PLAIN);
		}
		const namespace = this.importOf(node.expression);
		if (namespace?.namespace && namespace.module in REACT_MODULES) {
			const name = node.name.text;
			const mapped = mapReactImport(namespace.module, name, false);
			if (!mapped) {
				this.used.add(namespace.local);
				this.note(
					RULE.unsupported,
					'error',
					node,
					UNSUPPORTED_VALUES[name] ?? `\`${node.getText(this.sf)}\` has no Octane equivalent.`,
				);
				return null;
			}
			this.count(RULE.import);
			return this.require(mapped.module, mapped.name, false);
		}
		const member = this.rewritePackageMember(node.expression, node.name, 'error');
		if (member !== null) return member;
		// event.nativeEvent: Octane events are already native.
		if (node.name.text === 'nativeEvent' && this.isEventParameter(node.expression)) {
			this.count(RULE.eventObject);
			return this.emit(node.expression, PLAIN);
		}
		if (node.name.text === 'target' && this.targetsControl(node.expression)) {
			this.count(RULE.eventObject);
			return this.emit(node.expression, PLAIN) + '.currentTarget';
		}
		return null;
	}

	/**
	 * Whether `node` names a global namespace React's types declare, such as
	 * `React` in `React.ReactNode` written without an import.
	 */
	isGlobalNamespace(node: ts.EntityName, name: string) {
		return (
			ts.isIdentifier(node) &&
			node.text === name &&
			!this.checker.resolveName(name, node, ts.SymbolFlags.Namespace, false)
		);
	}

	isReactNamespace(node: ts.EntityName): boolean {
		const entry = this.importOf(node);
		return entry
			? entry.namespace && entry.module === 'react'
			: this.isGlobalNamespace(node, 'React');
	}

	rewriteQualifiedType(node: ts.QualifiedName) {
		const member = this.rewritePackageMember(node.left, node.right, 'warning');
		if (member !== null) return member;
		const namespace = this.importOf(node.left);
		if (
			namespace
				? !namespace.namespace || !(namespace.module in REACT_MODULES)
				: !this.isGlobalNamespace(node.left, 'React')
		) {
			return null;
		}
		if (ts.isTypeQueryNode(node.parent)) {
			const mapped = mapReactImport(namespace?.module ?? 'react', node.right.text, true);
			if (mapped?.module === 'react') {
				if (!namespace) return null;
				this.count(RULE.import);
				return this.require(mapped.module, mapped.name, true);
			}
		}
		const name = mapQualifiedType(node.right.text);
		if (!name) {
			if (namespace) this.used.add(namespace.local);
			this.note(
				RULE.unsupported,
				'warning',
				node,
				`Octane has no type \`${node.getText(this.sf)}\`.`,
			);
			return null;
		}
		this.count(RULE.import);
		return this.require('octane', name, true);
	}

	rewriteTypeReference(
		node: ts.TypeReferenceNode | ts.ExpressionWithTypeArguments,
		name: ts.EntityName | ts.Expression,
	) {
		// The global `JSX` namespace React's types declared is Octane's export.
		if (ts.isQualifiedName(name) && this.isGlobalNamespace(name.left, 'JSX'))
			this.require('octane', 'JSX', true);
		const imported = this.reactTypeName(name);
		const event = this.nativeEventType(node, imported);
		if (event) {
			this.count(RULE.import);
			return event;
		}
		if (!imported || !this.isIntrinsicProps(node, imported)) return null;
		// Heritage parses a namespace as a property access, but its base is still a type.
		let base: string;
		if (ts.isIdentifier(name)) {
			this.used.add(name.text);
			base = name.getText(this.sf);
		} else {
			base = ts.isExternalModule(this.sf)
				? this.require('octane', imported, true)
				: `import(${this.quote}octane${this.quote}).${imported}`;
		}
		return this.wrapIntrinsicProps(node, base + this.span(node, name.end, node.end, PLAIN));
	}

	reactTypeName(name: ts.EntityName | ts.Expression) {
		if (ts.isQualifiedName(name)) return this.isReactNamespace(name.left) ? name.right.text : null;
		if (ts.isPropertyAccessExpression(name))
			return ts.isIdentifier(name.expression) && this.isReactNamespace(name.expression)
				? name.name.text
				: null;
		const entry = this.importOf(name);
		return entry?.module === 'react' ? entry.imported : null;
	}

	isIntrinsicProps(node: ts.NodeWithTypeArguments, name: string | null) {
		const tag = node.typeArguments?.[0];
		if (!tag || !name || !/^ComponentProps(?:WithRef|WithoutRef)?$/.test(name)) return false;
		const type = this.checker.getTypeFromTypeNode(tag);
		return type.isStringLiteral() && isDOMTag(type.value);
	}

	/** Keep React wrappers' string class and spreadable style while forwarding native host props. */
	wrapIntrinsicProps(node: ts.NodeWithTypeArguments, props: string) {
		if (!ts.isExternalModule(this.sf)) {
			// An import or a top-level helper would change the script's global declarations.
			const base = `globalThis.Omit<${props}, 'className' | 'style'>`;
			const fields = `globalThis.Partial<{ className: string | undefined; style: import(${this.quote}octane${this.quote}).CSSProperties | undefined }>`;
			return ts.isExpressionWithTypeArguments(node)
				? `${base}, ${fields}`
				: `(${base} & ${fields})`;
		}
		if (!this.intrinsicPropsHelper) {
			let helper = 'ReactDOMProps';
			while (this.declared.has(helper) || this.readsGlobal(helper)) helper += '_';
			this.intrinsicPropsHelper = helper;
		}
		return `${this.intrinsicPropsHelper}<${props}>`;
	}

	rewriteCall(node: ts.CallExpression) {
		if (node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0]) {
			const [specifier] = node.arguments;
			const mapped = ts.isStringLiteral(specifier) ? REACT_MODULES[specifier.text] : undefined;
			if (mapped === undefined) return this.rewriteSpecifier(node, specifier);
			this.count(RULE.import);
			return this.replaceSpecifier(node, specifier, mapped);
		}
		if (
			ts.isPropertyAccessExpression(node.expression) &&
			node.expression.name.text === 'render' &&
			node.arguments.length === 1
		) {
			const receiver = skipParens(node.expression.expression);
			const root = ts.isIdentifier(receiver) ? this.constValue(receiver) : receiver;
			if (root && ts.isCallExpression(root) && this.calleeName(root.expression) === 'createRoot') {
				const rewritten = this.rewriteRootRender(node, node.arguments[0]);
				if (rewritten !== null) this.checkLocalReactRoot(node, receiver, root);
				return rewritten;
			}
		}
		const callee = this.callee(node.expression);
		// An Octane hook without a list already means "inferred".
		if (!callee || callee.module === 'octane') return null;
		const name = callee.name;
		if (name === 'useState' && callee.module === 'react' && node.arguments[0])
			this.checkInitializerResourceHints(node.arguments[0]);
		if (name === 'useSyncExternalStore' && this.strong && this.target === 'tsrx')
			return this.nativeSignalRead(node);
		if (name === 'forwardRef') return this.rewriteForwardRef(node);
		if (name === 'render' || name === 'hydrate') return this.rewriteLegacyRoot(node, name);
		if (name === 'hydrateRoot' && node.arguments.length === 2) {
			return this.rewriteRootRender(node, node.arguments[1]);
		}
		if (
			(name === 'renderToString' || name === 'renderToStaticMarkup') &&
			callee.module.startsWith('react-dom/server') &&
			node.arguments.length === 1
		) {
			// React returns the HTML; Octane returns `{ html, css }`.
			this.count(RULE.serverRender);
			return (
				(this.rewriteRootRender(node, node.arguments[0]) ??
					this.span(node, node.getStart(this.sf), node.end, PLAIN)) + '.html'
			);
		}
		if (name === 'flushSync') {
			this.note(
				RULE.flushSync,
				'warning',
				node,
				"Octane's `flushSync` commits synchronously but leaves the commit's `useEffect`s queued, where React runs them before returning. If code after it reads what an effect did, use `useLayoutEffect` for that effect.",
			);
			return null;
		}
		if (name in DEPENDENCY_HOOKS) {
			const depsIndex = DEPENDENCY_HOOKS[name];
			if (callee.module === 'react' && node.arguments.length === depsIndex + 1)
				this.checkHookDependencyReads(node, node.arguments[depsIndex]);
			return this.rewriteDependencies(node, name);
		}
		return null;
	}

	private checkInitializerResourceHints(initializer: ts.Expression) {
		const resourceHint = this.options.initializerResourceHint;
		if (!resourceHint) return;
		const value = skipWrappers(initializer);
		const check = (callee: ts.Expression, site: ts.Node) => {
			callee = skipWrappers(callee);
			if (!ts.isIdentifier(callee)) return;
			const declaration = this.declarationOf(callee);
			const imported = declaration && this.imports.get(declaration);
			if (!imported || imported.typeOnly || imported.namespace) return;
			if (site !== initializer && ts.findAncestor(declaration, ts.isImportDeclaration)?.attributes)
				return;
			const hint = resourceHint(imported.module, imported.imported);
			if (hint)
				this.note(
					RULE.bindings,
					'error',
					site,
					`The initializer calls \`${imported.imported}\`, which uses React DOM ${hint} from plain TypeScript. Move the resource hint into Octane-compiled code so the server renderer can collect it.`,
				);
		};
		if (!ts.isArrowFunction(value) && !ts.isFunctionExpression(value)) {
			if (ts.isIdentifier(value)) check(value, initializer);
			return;
		}
		if (value.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) return;
		if (ts.isFunctionExpression(value) && value.asteriskToken) return;
		// Follow eager expressions only. A returned callback or a lazy operand may never run.
		const visit = (node: ts.Node) => {
			if (isFunctionLike(node) || ts.isClassLike(node) || ts.isTypeNode(node)) return;
			if (ts.isConditionalExpression(node)) return visit(node.condition);
			if (ts.isOptionalChain(node)) return visit(node.expression);
			if (ts.isBinaryExpression(node)) {
				const kind = node.operatorToken.kind;
				if (
					kind === ts.SyntaxKind.AmpersandAmpersandToken ||
					kind === ts.SyntaxKind.BarBarToken ||
					kind === ts.SyntaxKind.QuestionQuestionToken ||
					kind === ts.SyntaxKind.AmpersandAmpersandEqualsToken ||
					kind === ts.SyntaxKind.BarBarEqualsToken ||
					kind === ts.SyntaxKind.QuestionQuestionEqualsToken
				)
					return visit(node.left);
			}
			if (ts.isCallExpression(node)) check(node.expression, node);
			ts.forEachChild(node, visit);
		};
		if (!ts.isBlock(value.body)) return visit(value.body);
		for (const statement of value.body.statements) {
			if (ts.isReturnStatement(statement)) {
				if (statement.expression) visit(statement.expression);
				break;
			}
			if (ts.isExpressionStatement(statement)) visit(statement.expression);
			else if (ts.isVariableStatement(statement)) {
				for (const { initializer } of statement.declarationList.declarations) {
					if (initializer) visit(initializer);
				}
			} else break;
		}
	}

	/** Publish an exclusive native host ref through the existing external-store hook. */
	private nativeRefState(statement: ts.VariableStatement) {
		const { declarationList } = statement;
		if (!(declarationList.flags & ts.NodeFlags.Const) || declarationList.declarations.length !== 1)
			return null;
		const [{ name, initializer, type: annotation }] = declarationList.declarations;
		if (
			annotation ||
			!ts.isArrayBindingPattern(name) ||
			name.elements.length !== 2 ||
			!initializer ||
			!ts.isCallExpression(initializer) ||
			initializer.questionDotToken ||
			initializer.arguments.length !== 1 ||
			initializer.arguments[0].kind !== ts.SyntaxKind.NullKeyword ||
			initializer.typeArguments?.length !== 1
		)
			return null;
		const hook = this.callee(initializer.expression);
		if (hook?.module !== 'react' || hook.name !== 'useState' || !this.options.automaticReactJsx)
			return null;
		const [value, setter] = name.elements;
		if (
			!ts.isBindingElement(value) ||
			!ts.isBindingElement(setter) ||
			!ts.isIdentifier(value.name) ||
			!ts.isIdentifier(setter.name) ||
			value.initializer ||
			setter.initializer ||
			value.dotDotDotToken ||
			setter.dotDotDotToken
		)
			return null;
		const refs = this.localUses(setter.name);
		if (refs.length !== 1) return null;
		const [ref] = refs;
		const expression = ref.parent;
		if (!ts.isJsxExpression(expression) || expression.expression !== ref) return null;
		const attribute = expression.parent;
		if (
			!ts.isJsxAttribute(attribute) ||
			attribute.initializer !== expression ||
			!ts.isIdentifier(attribute.name) ||
			attribute.name.text !== 'ref'
		)
			return null;
		const host = attribute.parent.parent;
		if (
			!ts.isIdentifier(host.tagName) ||
			!/^[a-z]/.test(host.tagName.text) ||
			host.attributes.properties.some(ts.isJsxSpreadAttribute)
		)
			return null;
		const owner = ts.findAncestor(statement, isFunctionLike);
		const output = ts.isJsxOpeningElement(host) ? host.parent : host;
		if (
			!owner ||
			!(
				ts.isFunctionDeclaration(owner) ||
				ts.isFunctionExpression(owner) ||
				ts.isArrowFunction(owner)
			) ||
			owner.body !== statement.parent ||
			owner.asteriskToken ||
			owner.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ||
			!this.isComponent(owner) ||
			nativeOutputOwner(output, () => false, {
				typeOf: (node) => this.typeOf(node),
				text: (node) => scalar(this.typeOf(node)),
			}) !== owner ||
			reads(owner, (name) => name.text === 'eval') ||
			this.lostComments(statement.getStart(this.sf), statement.end, '').length
		)
			return null;

		let binding = owner.name;
		if (!ts.isFunctionDeclaration(owner)) {
			const declaration = owner.parent;
			if (
				!ts.isVariableDeclaration(declaration) ||
				declaration.initializer !== owner ||
				!ts.isIdentifier(declaration.name) ||
				!(ts.getCombinedNodeFlags(declaration) & ts.NodeFlags.Const)
			)
				return null;
			binding = declaration.name;
		}
		if (
			(binding && !this.localUses(binding).every(componentTagOrExport)) ||
			(owner.name &&
				owner.name !== binding &&
				!this.localUses(owner.name).every(componentTagOrExport))
		)
			return null;

		const fresh = (base: string) => {
			while (this.declared.has(base) || this.readsGlobal(base)) base += '_';
			this.declared.add(base);
			return base;
		};
		const factory = (this.nativeRefStoreFactory ??= fresh('createNativeRefStore'));
		const cell = fresh(value.name.text + 'RefStore');
		const memo = this.require('octane', 'useMemo', false);
		const read = this.require('octane', 'useSyncExternalStore', false);
		const type = this.emit(initializer.typeArguments[0], PLAIN);
		const line = '\n' + this.indentOf(statement);
		this.count(RULE.nativeRefState);
		return (
			`const ${cell} = ${memo}(() => ${factory}<${type}>(null));${line}` +
			`const ${value.name.getText(this.sf)} = ${read}(${cell}.subscribe, ${cell}.get, ${cell}.get);${line}` +
			`const ${setter.name.getText(this.sf)} = ${cell}.attach;`
		);
	}

	/** Replace only a direct render subscription to one native writable cell, with identical SSR and client reads. */
	nativeSignalRead(node: ts.CallExpression) {
		if (node.arguments.length !== 3 || node.questionDotToken || node.typeArguments) return null;
		const [subscribe, get, server] = node.arguments;
		const receiver = (fn: ts.Expression, method: 'subscribe' | 'get') => {
			if (
				!ts.isArrowFunction(fn) ||
				fn.modifiers ||
				fn.type ||
				fn.typeParameters ||
				!ts.isCallExpression(fn.body)
			)
				return null;
			const call = fn.body;
			const member = call.expression;
			if (
				call.typeArguments ||
				call.questionDotToken ||
				!ts.isPropertyAccessExpression(member) ||
				member.questionDotToken ||
				member.name.text !== method ||
				!ts.isIdentifier(member.expression)
			)
				return null;
			const arity = method === 'get' ? 0 : 1;
			if (fn.parameters.length !== arity || call.arguments.length !== arity) return null;
			if (arity === 1) {
				const [parameter] = fn.parameters;
				const [argument] = call.arguments;
				if (
					!ts.isIdentifier(parameter.name) ||
					parameter.type ||
					parameter.initializer ||
					parameter.dotDotDotToken ||
					!ts.isIdentifier(argument) ||
					this.declarationOf(argument) !== parameter
				)
					return null;
			}
			return member.expression;
		};
		const signal = receiver(get, 'get');
		const watch = receiver(subscribe, 'subscribe');
		const ssr = receiver(server, 'get');
		if (!signal || !watch || !ssr || !this.constValue(signal)) return null;
		const decl = this.declarationOf(signal);
		if (this.declarationOf(watch) !== decl || this.declarationOf(ssr) !== decl) return null;
		const owner = ts.findAncestor(node, isFunctionLike);
		if (
			!owner ||
			!(
				ts.isFunctionDeclaration(owner) ||
				ts.isFunctionExpression(owner) ||
				ts.isArrowFunction(owner)
			) ||
			!this.isComponent(owner) ||
			!this.isWritableSignal(signal)
		)
			return null;
		if (this.lostComments(node.getStart(this.sf), node.end, '').length) return null;
		this.count(RULE.nativeSignal);
		return signal.text + '.get()';
	}

	usesSignalRuntime(node: ts.Node): boolean {
		if (ts.isImportDeclaration(node))
			return (
				!node.importClause &&
				ts.isStringLiteral(node.moduleSpecifier) &&
				SIGNAL_MODULES.has(node.moduleSpecifier.text)
			);
		// A value call keeps the import alive even if TypeScript elides type-only uses.
		if (ts.isCallExpression(node)) {
			const name = ts.isPropertyAccessExpression(node.expression)
				? node.expression.expression
				: node.expression;
			const binding = this.importOf(name);
			if (binding && !binding.typeOnly && SIGNAL_MODULES.has(binding.module)) return true;
		}
		return ts.forEachChild(node, (child) => this.usesSignalRuntime(child) || undefined) === true;
	}

	isWritableSignal(signal: ts.Identifier) {
		const init = this.constValue(signal);
		if (init && ts.isCallExpression(init)) {
			const factory = this.importOf(init.expression);
			if (
				factory?.module === 'octane/signals' &&
				factory.imported === 'signal$' &&
				!factory.typeOnly
			)
				return true;
		}
		// The public type's identity distinguishes native handles from ordinary stores with get/subscribe.
		// Opting in would also subscribe unrelated render reads elsewhere in this module.
		if (!(this.hasSignalRuntime ??= this.usesSignalRuntime(this.sf))) return false;
		const resolved = this.projectType(signal);
		if (resolved?.type.getSymbol()?.name !== 'WritableSignal') return false;
		const file = this.options.types!.sourceFile;
		for (const stmt of file.statements) {
			if (
				!ts.isImportDeclaration(stmt) ||
				!ts.isStringLiteral(stmt.moduleSpecifier) ||
				stmt.moduleSpecifier.text !== 'octane/signals'
			)
				continue;
			const module = resolved.checker.getSymbolAtLocation(stmt.moduleSpecifier);
			const exported =
				module &&
				resolved.checker.getExportsOfModule(module).find((s) => s.name === 'WritableSignal');
			if (
				exported &&
				(exported.flags & ts.SymbolFlags.Alias
					? resolved.checker.getAliasedSymbol(exported)
					: exported) === resolved.type.getSymbol()
			)
				return true;
		}
		return false;
	}

	/**
	 * A render-local function has a fresh identity each time the component runs.
	 * Tracking that identity refreshes the handle on each render.
	 */
	freshHandleDependency(node: ts.CallExpression, name: string) {
		const [ref, factory] = node.arguments;
		const statement = node.parent;
		if (
			!this.strong ||
			name !== 'useImperativeHandle' ||
			node.questionDotToken ||
			ts.isSpreadElement(ref) ||
			!ts.isArrowFunction(factory) ||
			factory.modifiers?.length ||
			factory.parameters.length ||
			ts.isBlock(factory.body) ||
			!ts.isExpressionStatement(statement) ||
			!ts.isBlock(statement.parent) ||
			!isFunctionLike(statement.parent.parent)
		)
			return;
		const object = skipParens(factory.body);
		if (!ts.isObjectLiteralExpression(object) || object.properties.length !== 1) return;
		const [field] = object.properties;
		if (!ts.isShorthandPropertyAssignment(field) || field.objectAssignmentInitializer) return;
		const method = this.declarationOf(field.name);
		if (
			!method ||
			!ts.isFunctionDeclaration(method) ||
			method.parent !== statement.parent ||
			!method.body
		)
			return;
		const binding = method.name;
		if (
			!binding ||
			this.localUses(binding).some(
				(use) =>
					use !== field.name && !(ts.isCallExpression(use.parent) && use.parent.expression === use),
			) ||
			// TypeScript can bind a function and a same-named var to separate symbols.
			reads(
				statement.parent.parent,
				(id) =>
					id.text === 'eval' || (id !== binding && id.text === binding.text && declaresName(id)),
			)
		)
			return;
		return `[${field.name.getText(this.sf)}]`;
	}

	private ownDataDependency(
		member: ts.PropertyAccessExpression | ts.ElementAccessExpression,
		hook: ts.CallExpression,
	) {
		const receiver = skipWrappers(member.expression);
		const name = ts.isPropertyAccessExpression(member)
			? member.name
			: skipWrappers(member.argumentExpression);
		if (
			!ts.isStringLiteralLike(name) &&
			!(ts.isPropertyAccessExpression(member) && ts.isIdentifier(name))
		)
			return false;
		const key = name.text;
		if (key === '__proto__' || !ts.isIdentifier(receiver)) return false;
		const init = this.constValue(receiver);
		const object = init && skipWrappers(init);
		const owner = ts.findAncestor(hook, ts.isFunctionLike);
		if (
			!object ||
			!ts.isObjectLiteralExpression(object) ||
			!owner ||
			!fixedBinding(this.checker, receiver, hook) ||
			this.localUses(receiver).some((name) => !declaresName(name)) ||
			reads(owner, (name) => name.text === 'eval')
		)
			return false;
		// Spreads, computed names and accessors can redefine the property.
		return (
			object.properties.every(
				(field) =>
					(ts.isPropertyAssignment(field) && !ts.isComputedPropertyName(field.name)) ||
					(ts.isShorthandPropertyAssignment(field) && !field.objectAssignmentInitializer),
			) &&
			object.properties.some(
				({ name }) =>
					name && (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) && name.text === key,
			)
		);
	}

	private checkHookDependencyReads(node: ts.CallExpression, deps: ts.Expression) {
		const list = skipWrappers(deps);
		if (!this.emitsTsrx || !ts.isArrayLiteralExpression(list)) return;
		const read = (expr: ts.Expression): ts.Expression | undefined => {
			const member = skipWrappers(expr);
			if (ts.isConditionalExpression(member)) {
				const condition = skipWrappers(member.condition);
				if (condition.kind === ts.SyntaxKind.TrueKeyword) return read(member.whenTrue);
				if (condition.kind === ts.SyntaxKind.FalseKeyword) return read(member.whenFalse);
				return read(condition) ?? read(member.whenTrue) ?? read(member.whenFalse);
			}
			if (
				(ts.isPropertyAccessExpression(member) || ts.isElementAccessExpression(member)) &&
				!this.ownDataDependency(member, node)
			)
				return member;
		};
		let opaque: ts.Expression | undefined;
		for (const entry of list.elements) {
			opaque = read(entry);
			if (opaque) break;
		}
		if (opaque)
			this.note(
				RULE.deps,
				'error',
				opaque,
				'This hook dependency reads a property during render and may run a getter owned by React. Keep the component in React or verify the getter before moving it to native SSR.',
			);
	}

	/**
	 * React runs a hook with an omitted or undefined list on every render.
	 * Octane spells that schedule with `null` or a fresh dependency.
	 */
	rewriteDependencies(node: ts.CallExpression, name: string) {
		const depsIndex = DEPENDENCY_HOOKS[name];
		if (node.arguments.length === depsIndex + 1) {
			const deps = skipParens(node.arguments[depsIndex]);
			if (!ts.isIdentifier(deps) || deps.text !== 'undefined' || this.declarationOf(deps))
				return null;
			this.count(RULE.deps);
			return (
				this.span(node, node.getStart(this.sf), deps.getStart(this.sf), PLAIN) +
				(this.freshHandleDependency(node, name) ?? 'null') +
				this.source.slice(deps.end, node.end)
			);
		}
		if (node.arguments.length !== depsIndex) return null;
		this.count(RULE.deps);
		const last = node.arguments[node.arguments.length - 1];
		const deps = this.freshHandleDependency(node, name) ?? 'null';
		return (
			this.span(node, node.getStart(this.sf), last.end, PLAIN) +
			', ' +
			deps +
			this.source.slice(last.end, node.end)
		);
	}

	/**
	 * `forwardRef((props, ref) => …)` becomes the inner function with `ref`
	 * read from props.
	 */
	rewriteForwardRef(node: ts.CallExpression) {
		const [render] = node.arguments;
		if (
			node.arguments.length !== 1 ||
			!(ts.isArrowFunction(render) || ts.isFunctionExpression(render)) ||
			render.parameters.length > 2
		) {
			this.note(
				RULE.forwardRef,
				'error',
				node,
				'Unwrap this `forwardRef`: refs are ordinary props in Octane.',
			);
			return null;
		}
		this.count(RULE.forwardRef);
		const [props, ref] = render.parameters;
		const typeArgs = node.typeArguments;
		const refType = typeArgs?.[0] ? this.emit(typeArgs[0], PLAIN) : this.refTypeOf(ref);
		const propsNode = typeArgs?.[1] ?? props?.type;
		const propsType = propsNode ? this.emit(propsNode, PLAIN) : null;
		const refName = ref && ts.isIdentifier(ref.name) ? ref.name.text : null;
		const refBinding = refName === null ? null : refName === 'ref' ? 'ref' : `ref: ${refName}`;

		// Splice `ref` into the props pattern in the pattern's own layout.
		let pattern: string | null;
		if (!props) pattern = refBinding ? `{ ${refBinding} }` : null;
		else if (refBinding === null) pattern = this.emit(props.name, PLAIN);
		else if (ts.isObjectBindingPattern(props.name)) {
			const elements = props.name.elements;
			const rest = elements.find((element) => element.dotDotDotToken);
			const last = elements[elements.length - 1];
			const multiline = this.source
				.slice(props.name.getStart(this.sf), props.name.end)
				.includes('\n');
			if (rest) {
				const separator = multiline ? `,\n${this.indentOf(rest)}` : ', ';
				pattern =
					this.span(props.name, props.name.getStart(this.sf), rest.getStart(this.sf), PLAIN) +
					refBinding +
					separator +
					this.span(props.name, rest.getStart(this.sf), props.name.end, PLAIN);
			} else if (last) {
				const separator = multiline ? `,\n${this.indentOf(last)}` : ', ';
				pattern =
					this.span(props.name, props.name.getStart(this.sf), last.end, PLAIN) +
					separator +
					refBinding +
					this.source.slice(last.end, props.name.end);
			} else pattern = `{ ${refBinding} }`;
		} else if (ts.isIdentifier(props.name) && props.name.text !== '_') {
			pattern = `{ ${refBinding}, ...${props.name.text} }`;
		} else {
			pattern = `{ ${refBinding} }`;
		}

		let annotation = '';
		if (this.isTypeScript() && (propsType || refType)) {
			const refProp = refType ? `{ ref?: ${this.require('octane', 'Ref', true)}<${refType}> }` : '';
			annotation = ': ' + [propsType, refProp].filter(Boolean).join(' & ');
		}
		// Keep the parameter list's layout: the props parameter is replaced in
		// place and the ref parameter goes with the comma before it.
		const list = render.parameters;
		let parameters: string;
		if (pattern === null) parameters = '';
		else if (!props) parameters = pattern + annotation;
		else {
			parameters =
				this.source.slice(list.pos, props.getStart(this.sf)) +
				pattern +
				annotation +
				this.source.slice(ref ? ref.end : props.end, list.end);
		}
		this.parameters.set(render, parameters);
		return this.emit(render, PLAIN);
	}

	/**
	 * A function's text up to its body, with any parameters a rule replaced.
	 */
	head(node: ts.SignatureDeclaration & { body?: ts.Node }, end: number) {
		const parameters = this.parameters.get(node);
		if (parameters === undefined) return this.span(node, node.getStart(this.sf), end, PLAIN);
		return (
			this.span(node, node.getStart(this.sf), node.parameters.pos, PLAIN) +
			parameters +
			this.span(node, node.parameters.end, end, PLAIN)
		);
	}

	refTypeOf(ref: ts.ParameterDeclaration | undefined) {
		const type = ref?.type;
		if (type && ts.isTypeReferenceNode(type) && type.typeArguments?.length === 1) {
			return this.emit(type.typeArguments[0], PLAIN);
		}
		return null;
	}

	isTypeScript() {
		return /\.[cm]?tsx?$/.test(this.filename);
	}

	rewriteLegacyRoot(node: ts.CallExpression, name: 'render' | 'hydrate') {
		const [element, container, callback] = node.arguments;
		if (!element || !container) return null;
		if (callback) {
			this.note(
				RULE.legacyRoot,
				'warning',
				node,
				'The legacy render callback was dropped; run it from an effect.',
			);
		}
		this.count(RULE.legacyRoot);
		const elementText = this.rootComponent(element) ?? this.emit(element, PLAIN);
		const containerText = this.emit(container, PLAIN);
		return name === 'render'
			? `${this.require('octane', 'createRoot', false)}(${containerText}).render(${elementText})`
			: `${this.require('octane', 'hydrateRoot', false)}(${containerText}, ${elementText})`;
	}

	/** Report renderer ownership only for the ordinary direct root rewrite. */
	private checkLocalReactRoot(
		call: ts.CallExpression,
		receiver: ts.Expression,
		root: ts.CallExpression,
	) {
		const local = this.options.localReactRootComponent;
		const element = skipParens(call.arguments[0]);
		if (!local || !ts.isJsxSelfClosingElement(element) || !ts.isIdentifier(element.tagName)) return;
		const tag = element.tagName;
		const leaf = this.importOf(tag);
		const factoryName = ts.isPropertyAccessExpression(root.expression)
			? root.expression.expression
			: root.expression;
		const rootImport = this.importOf(factoryName);
		const factoryBinding = ts.isIdentifier(factoryName) && this.declarationOf(factoryName);
		if (
			!leaf ||
			leaf.typeOnly ||
			ts.findAncestor(this.declarationOf(tag)!, ts.isImportDeclaration)?.attributes ||
			rootImport?.module !== 'react-dom/client' ||
			rootImport.typeOnly ||
			!factoryBinding ||
			!(ts.isImportSpecifier(factoryBinding) || ts.isNamespaceImport(factoryBinding)) ||
			ts.findAncestor(factoryBinding, ts.isImportDeclaration)?.attributes ||
			ts.isOptionalChain(call) ||
			ts.isOptionalChain(root) ||
			!this.options.automaticReactJsx ||
			((this.source.includes('eval') || this.source.includes('\\u')) && hasEval(this.sf))
		)
			return;
		if (ts.isIdentifier(receiver)) {
			const declaration = root.parent;
			if (
				!ts.isVariableDeclaration(declaration) ||
				!ts.isIdentifier(declaration.name) ||
				ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Export ||
				(ts.getCombinedNodeFlags(declaration) & ts.NodeFlags.BlockScoped) !== ts.NodeFlags.Const
			)
				return;
			const statement = declaration.parent.parent;
			if (!ts.isVariableStatement(statement)) return;
			const topLevel =
				ts.isExpressionStatement(call.parent) &&
				call.parent.parent === this.sf &&
				statement.parent === this.sf &&
				statement.end <= call.getStart(this.sf);
			if (
				(!topLevel && !initializedBefore(this.checker, receiver, call)) ||
				renderUses(this.localUses(declaration.name)).some((ref) => {
					const access = ref.parent;
					return (
						!ts.isPropertyAccessExpression(access) ||
						access.expression !== ref ||
						(access.name.text !== 'render' && access.name.text !== 'unmount') ||
						!ts.isCallExpression(access.parent) ||
						access.parent.expression !== access
					);
				})
			)
				return;
		}
		const hook = local(leaf.module, leaf.imported);
		if (hook)
			this.note(
				RULE.rootRender,
				'error',
				tag,
				`The migrated root renders ${tag.text}, but the unchanged ${leaf.module} export calls React's ${hook}. Migrate the component or keep this root under React DOM.`,
			);
	}

	/**
	 * `root.render(<App a={1} />)` and `root.render(createElement(App, props))`
	 * are `root.render(App, props)`, which mounts the component without an
	 * element: the generic element renderer stays out of the bundle. So are
	 * `hydrateRoot(c, <App />)` and the server renderers' element argument.
	 *
	 * @param argument the element, the call's last argument
	 */
	rewriteRootRender(node: ts.CallExpression, argument: ts.Expression) {
		const component = this.rootComponent(argument);
		if (component === null) return null;
		this.count(RULE.rootRender);
		return (
			this.span(node, node.getStart(this.sf), argument.getStart(this.sf), PLAIN) +
			component +
			this.span(node, argument.end, node.end, PLAIN)
		);
	}

	/**
	 * `App` or `App, props` for an element of a component with no key, ref,
	 * or children, through a `<StrictMode>` wrapper, else null.
	 */
	rootComponent(expression: ts.Expression): string | null {
		let node = skipParens(expression);
		if (ts.isJsxElement(node) && this.calleeName(node.openingElement.tagName) === 'StrictMode') {
			const children = node.children.filter(
				(child) => !(ts.isJsxText(child) && child.containsOnlyTriviaWhiteSpaces),
			);
			if (children.length !== 1 || !isJsx(children[0])) return null;
			node = children[0];
		}
		if (ts.isJsxSelfClosingElement(node)) {
			const tag = node.tagName;
			if (!ts.isIdentifier(tag) && !ts.isPropertyAccessExpression(tag)) return null;
			if (!isComponentName(tag.getText(this.sf).split('.').pop() ?? '')) return null;
			const props: string[] = [];
			for (const property of node.attributes.properties) {
				if (ts.isJsxSpreadAttribute(property)) {
					props.push(`...${this.emit(property.expression, PLAIN)}`);
					continue;
				}
				const name = property.name.getText(this.sf);
				if (name === 'key' || name === 'ref') return null;
				const key = /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);
				const value = property.initializer;
				if (!value) props.push(`${key}: true`);
				else if (ts.isStringLiteral(value)) props.push(`${key}: ${value.getText(this.sf)}`);
				else if (ts.isJsxExpression(value) && value.expression)
					props.push(`${key}: ${this.emit(value.expression, PLAIN)}`);
				else return null;
			}
			const type = this.emit(tag, PLAIN);
			return props.length === 0 ? type : `${type}, { ${props.join(', ')} }`;
		}
		if (ts.isCallExpression(node) && this.calleeName(node.expression) === 'createElement') {
			const [type, props, ...children] = node.arguments;
			if (!type || children.length > 0) return null;
			if (!(ts.isIdentifier(type) || ts.isPropertyAccessExpression(type))) return null;
			if (!isComponentName(type.getText(this.sf).split('.').pop() ?? '')) return null;
			const text = this.emit(type, PLAIN);
			return !props || isNullish(props) ? text : `${text}, ${this.emit(props, PLAIN)}`;
		}
		return null;
	}

	private rewriteFreshHandle(statement: ts.ExpressionStatement, call: ts.CallExpression) {
		const [ref, factory, argument] = call.arguments;
		const deps = argument && skipParens(argument);
		const body = statement.parent;
		if (
			!this.strong ||
			this.target !== 'tsrx' ||
			!ts.isIdentifier(call.expression) ||
			this.reactHook(call.expression) !== 'useImperativeHandle' ||
			call.questionDotToken ||
			call.arguments.length < 2 ||
			call.arguments.length > 3 ||
			(deps && (!ts.isIdentifier(deps) || deps.text !== 'undefined' || this.declarationOf(deps))) ||
			!ts.isIdentifier(ref) ||
			!ts.isArrowFunction(factory) ||
			factory.modifiers?.length ||
			factory.typeParameters?.length ||
			factory.parameters.length ||
			!factory.type ||
			ts.isBlock(factory.body) ||
			!ts.isBlock(body) ||
			!ts.isFunctionDeclaration(body.parent) ||
			body.parent.parent !== this.sf ||
			body.parent.asteriskToken ||
			body.parent.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword) ||
			!this.isComponent(body.parent)
		)
			return null;
		const value = skipParens(factory.body);
		if (
			!ts.isObjectLiteralExpression(value) ||
			!value.properties.length ||
			!value.properties.every(
				(field) =>
					ts.isPropertyAssignment(field) &&
					(ts.isIdentifier(field.name) || ts.isStringLiteral(field.name)) &&
					field.name.text !== '__proto__' &&
					ts.isArrowFunction(field.initializer),
			) ||
			!fixedBinding(this.checker, ref, call) ||
			!initializedBefore(this.checker, ref, call) ||
			reads(body.parent, (id) => id.text === 'eval') ||
			this.lostComments(statement.getFullStart(), call.end, '').length
		)
			return null;

		// Strong tracks this reference. A const arrow could be auto-memoized.
		let name = 'createHandle';
		while (this.declared.has(name) || this.readsGlobal(name)) name += '_';
		this.declared.add(name);
		this.count(RULE.deps);
		return (
			`let ${name} = ${this.emit(factory, PLAIN)};\n${this.indentOf(statement)}` +
			this.span(call, call.getStart(this.sf), factory.getStart(this.sf), PLAIN) +
			`${name}, [${name}]` +
			this.source.slice((argument ?? factory).end, statement.end)
		);
	}

	rewriteStatement(node: ts.ExpressionStatement) {
		const call = node.expression;
		if (ts.isCallExpression(call)) {
			const handle = this.rewriteFreshHandle(node, call);
			if (handle !== null) return handle;
		}
		if (
			ts.isCallExpression(call) &&
			call.arguments.length === 0 &&
			ts.isPropertyAccessExpression(call.expression) &&
			call.expression.name.text === 'persist' &&
			this.isEventParameter(call.expression.expression)
		) {
			// Octane never pools events, so there is nothing to persist.
			this.count(RULE.eventObject);
			return DROP;
		}
		return null;
	}

	/**
	 * The parameter `node` refers to, with its function.
	 */
	parameterOf(
		node: ts.Node,
	): { fn: ts.SignatureDeclaration; param: ts.ParameterDeclaration } | null {
		if (!ts.isIdentifier(node)) return null;
		const param = this.declarationOf(node);
		if (!param || !ts.isParameter(param)) return null;
		return { fn: param.parent, param };
	}

	private nativeEventType(node: ts.NodeWithTypeArguments, name: string | null) {
		const genericHandler = name === 'ReactEventHandler';
		if (!genericHandler && name !== 'SubmitEvent' && name !== 'SubmitEventHandler')
			return undefined;
		const target = node.typeArguments?.[0];
		const type = (name: string) =>
			ts.isExternalModule(this.sf)
				? this.require('octane', name, true)
				: `import(${this.quote}octane${this.quote}).${name}`;
		if (genericHandler) {
			const native = type('NativeEvent');
			const event = target ? `${native}<${this.emit(target, PLAIN)}>` : native;
			return `${type('EventHandler')}<${event}>`;
		}
		const global = this.checker.resolveName(
			'globalThis',
			node,
			ts.SymbolFlags.Namespace | ts.SymbolFlags.Type | ts.SymbolFlags.Value,
			false,
		);
		if (this.declaresHere(global)) {
			this.note(
				RULE.unsupported,
				'error',
				node,
				'The local globalThis binding shadows the DOM submit event type. Review this annotation.',
			);
			return null;
		}
		const host = target ? this.emit(target, PLAIN) : 'globalThis.Element';
		const event = `${type('NativeEvent')}<${host}, globalThis.SubmitEvent>`;
		return name === 'SubmitEventHandler' ? `${type('EventHandler')}<${event}>` : event;
	}

	/** Let the isolated checker propagate the original React types through
	 * assertions and contextual signatures, without changing ordinary binding. */
	private indexReactEventParameters() {
		const names = new Set<string>();
		const edits: { start: number; end: number; handler: boolean }[] = [];
		const original: ts.ParameterDeclaration[] = [];
		const projections: ts.Node[] = [];
		const projection = (node: ts.Node): [ts.TypeNode, ts.TypeNode] | undefined => {
			if (ts.isIndexedAccessTypeNode(node)) return [node.objectType, node.indexType];
			if (
				ts.isTypeReferenceNode(node) &&
				ts.isIdentifier(node.typeName) &&
				node.typeName.text === 'Pick' &&
				node.typeArguments?.length === 2
			)
				return [node.typeArguments[0], node.typeArguments[1]];
		};
		const replace = (name: string | null, first: ts.Node, last = first) => {
			const handler = name === 'SubmitEventHandler' || name === 'ReactEventHandler';
			if (name === 'SubmitEvent' || handler)
				edits.push({
					start: first.getStart(this.sf),
					end: last.end,
					handler,
				});
		};
		const collect = (node: ts.Node) => {
			if (ts.isIdentifier(node)) names.add(node.text);
			if (ts.isParameter(node)) original.push(node);
			if (projection(node)) projections.push(node);
			if (ts.isTypeReferenceNode(node)) {
				replace(this.reactTypeName(node.typeName), node.typeName);
			} else if (
				ts.isImportTypeNode(node) &&
				!node.isTypeOf &&
				ts.isLiteralTypeNode(node.argument) &&
				ts.isStringLiteral(node.argument.literal) &&
				node.argument.literal.text === 'react' &&
				node.qualifier &&
				ts.isIdentifier(node.qualifier)
			) {
				replace(node.qualifier.text, node, node.qualifier);
			}
			ts.forEachChild(node, collect);
		};
		collect(this.sf);
		if (!edits.length || (!original.length && !projections.length)) return undefined;
		let markerName = '__octaneChecked';
		while (
			[markerName, markerName + 'Event', markerName + 'Handler'].some((name) => names.has(name))
		)
			markerName += '_';
		const event = markerName + 'Event';
		const handler = markerName + 'Handler';

		// Only replace type names that the original binder resolved to React.
		// The virtual declarations stay out of both the emitted source and its checker.
		const pieces: string[] = [];
		let offset = 0;
		for (const edit of edits.sort((a, b) => a.start - b.start)) {
			pieces.push(this.source.slice(offset, edit.start), edit.handler ? handler : event);
			offset = edit.end;
		}
		pieces.push(this.source.slice(offset));
		const analysis = pieces.join('');
		const synthetic = Object.entries(syntheticEventMembers)
			.map(([name, type]) => `${name}: ${type};`)
			.join(' ');
		const { sf, checker } = bind(
			this.filename,
			analysis +
				`\ndeclare const ${markerName}: unique symbol;
interface ${event}<T = unknown> { readonly [${markerName}]: true; currentTarget: T; ${synthetic} }
type ${handler}<T = unknown> = { listener(event: ${event}<T>): void }['listener'];
`,
		);
		const declaration = sf.statements.at(-2);
		if (!declaration || !ts.isInterfaceDeclaration(declaration) || declaration.name.text !== event)
			return undefined;
		const members = new Set<ts.Declaration>(
			declaration.members.filter((member) => member.name?.getText(sf) !== 'currentTarget'),
		);
		const isEvent = (type: ts.Type): boolean =>
			type.isUnionOrIntersection()
				? type.types.some(isEvent)
				: type
						.getProperties()
						.some((property) => property.declarations?.some((item) => members.has(item)));
		const annotated = (type: ts.TypeNode, seen = new Set<ts.TypeAliasDeclaration>()): boolean => {
			if (ts.isUnionTypeNode(type) || ts.isIntersectionTypeNode(type))
				return type.types.some((member) => annotated(member, seen));
			if (ts.isParenthesizedTypeNode(type)) return annotated(type.type, seen);
			if (ts.isTypeReferenceNode(type)) {
				const alias = checker.getSymbolAtLocation(type.typeName)?.declarations?.[0];
				if (alias && ts.isTypeAliasDeclaration(alias) && !seen.has(alias)) {
					seen.add(alias);
					if (annotated(alias.type, seen)) return true;
				}
			}
			return isEvent(checker.getTypeFromTypeNode(type));
		};
		const contextual = (fn: ts.SignatureDeclaration): ts.Type | undefined => {
			if (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))
				return checker.getContextualType(fn);
			if (!ts.isMethodDeclaration(fn) || !ts.isObjectLiteralExpression(fn.parent)) return;
			if (!ts.isIdentifier(fn.name) && !ts.isStringLiteral(fn.name)) return;
			const object = fn.parent;
			let parent = object.parent;
			while (ts.isParenthesizedExpression(parent)) parent = parent.parent;
			const type =
				checker.getContextualType(object) ??
				(ts.isAsExpression(parent) ||
				ts.isSatisfiesExpression(parent) ||
				ts.isTypeAssertionExpression(parent)
					? checker.getTypeFromTypeNode(parent.type)
					: undefined);
			const property = type?.getProperty(fn.name.text);
			return property && checker.getTypeOfSymbolAtLocation(property, fn);
		};
		const analyzed: ts.ParameterDeclaration[] = [];
		const selections: [ts.TypeNode, ts.TypeNode][] = [];
		const gather = (node: ts.Node) => {
			if (ts.isParameter(node)) analyzed.push(node);
			const selection = projection(node);
			if (selection) selections.push(selection);
			ts.forEachChild(node, gather);
		};
		for (const statement of sf.statements.slice(0, -3)) gather(statement);
		const syntheticKey = (type: ts.Type): boolean =>
			type.isUnion()
				? type.types.some(syntheticKey)
				: type.isStringLiteral() && Object.hasOwn(syntheticEventMembers, type.value);
		if (selections.length === projections.length) {
			for (const [index, [object, key]] of selections.entries()) {
				const source = projections[index];
				if (
					(!ts.isTypeReferenceNode(source) ||
						(ts.isIdentifier(source.typeName) &&
							this.declarationOf(source.typeName)?.getSourceFile() === esLib())) &&
					isEvent(checker.getTypeFromTypeNode(object)) &&
					syntheticKey(checker.getTypeFromTypeNode(key))
				)
					this.note(
						RULE.unsupported,
						'error',
						source,
						'This event type selects a member available only on React synthetic events. Review the native annotation.',
					);
			}
		}
		// Type-name edits preserve the order and number of parameter declarations.
		if (analyzed.length !== original.length) return undefined;
		const result = new Set<ts.ParameterDeclaration>();
		for (const [index, parameter] of analyzed.entries()) {
			const fn = parameter.parent;
			if (!('body' in fn) || !fn.body) continue;
			if (
				isEvent(checker.getTypeAtLocation(parameter)) ||
				(parameter.type && annotated(parameter.type)) ||
				(fn.parameters[0] === parameter &&
					contextual(fn)
						?.getCallSignatures()
						.some((signature) => {
							const first = signature.getParameters()[0];
							return first && isEvent(checker.getTypeOfSymbolAtLocation(first, parameter));
						}))
			)
				result.add(original[index]);
		}
		return result;
	}

	private checkReactEventParameter(param: ts.ParameterDeclaration) {
		if (!ts.isIdentifier(param.name) || param.dotDotDotToken) {
			this.reportReactEventUse(param);
			return;
		}
		for (const ref of renderUses(this.localUses(param.name))) {
			const access = ref.parent;
			if (
				!ts.isPropertyAccessExpression(access) ||
				access.expression !== ref ||
				ts.findAncestor(access, ts.isFunctionLike) !== param.parent
			) {
				this.reportReactEventUse(ref);
				continue;
			}
			const member = access.name.text;
			const use = access.parent;
			if (member === 'preventDefault' || member === 'stopPropagation') {
				if (ts.isCallExpression(use) && use.expression === access) continue;
			}
			// The native currentTarget is dispatch-scoped and read-only.
			if (
				member === 'currentTarget' &&
				(ts.isPropertyAccessExpression(use) || ts.isElementAccessExpression(use)) &&
				use.expression === access &&
				!(
					ts.canHaveModifiers(param.parent) &&
					ts
						.getModifiers(param.parent)
						?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword)
				)
			)
				continue;
			this.reportReactEventUse(access);
		}
	}

	private checkProjectReactEventMember(
		node: ts.PropertyAccessExpression | ts.ElementAccessExpression,
		name: string,
	) {
		if (!Object.hasOwn(syntheticEventMembers, name)) return;
		const parameter = this.parameterOf(node.expression);
		if (parameter && this.reactEventParameters?.has(parameter.param)) return;
		// A contextual handler can acquire its synthetic event type in another module.
		const event = this.projectType(node.expression)?.type.getNonNullableType();
		if (event?.getSymbol()?.name !== 'SyntheticEvent') return;
		if (
			!event
				.getProperty(name)
				?.declarations?.some(
					(member) =>
						ts.isInterfaceDeclaration(member.parent) &&
						member.parent.name.text === 'BaseSyntheticEvent' &&
						/[/\\]node_modules[/\\]@types[/\\]react[/\\]/.test(member.getSourceFile().fileName),
				)
		)
			return;
		if (
			ts.findAncestor(
				node,
				(parent) =>
					(ts.isJsxElement(parent) || ts.isJsxSelfClosingElement(parent)) &&
					(this.islands.has(parent) ||
						this.reactRendererBodies.has(parent) ||
						this.reactCompatTag(
							ts.isJsxElement(parent) ? parent.openingElement.tagName : parent.tagName,
						)),
			)
		)
			return;
		this.reportReactEventUse(node);
	}

	private reportReactEventUse(node: ts.Node) {
		this.note(
			RULE.eventObject,
			'error',
			node,
			'This React event use needs review. Octane passes a native event with a typed currentTarget.',
		);
	}

	isEventParameter(node: ts.Node) {
		const found = this.parameterOf(node);
		if (!found) return false;
		if (this.reactEventParameters?.has(found.param)) return false;
		const type = found.param.type;
		if (type && ts.isTypeReferenceNode(type) && /Event$/.test(type.typeName.getText(this.sf))) {
			return true;
		}
		return this.handlerAttribute(found.fn) !== null;
	}

	/**
	 * The `on*` attribute an inline handler is passed to.
	 */
	handlerAttribute(fn: ts.Node) {
		const container = fn.parent;
		if (!container || !ts.isJsxExpression(container)) return null;
		const attribute = container.parent;
		return ts.isJsxAttribute(attribute) && /^on[A-Z]/.test(attribute.name.getText(this.sf))
			? attribute
			: null;
	}

	/**
	 * Whether `event.target` is the form control the handler is attached to, so
	 * it can read Octane's typed `currentTarget` instead. Octane types events as
	 * the native `Event`, whose `target` is an untyped `EventTarget`.
	 */
	targetsControl(node: ts.Node) {
		const found = this.parameterOf(node);
		if (!found) return false;
		// Unannotated, the project's types still name a handler a component
		// passes on to a control: `<Input onChange={(e) => …}>`. A library may
		// wrap the event (Base UI's `BaseUIEvent<ChangeEvent<…>>`); its first
		// type argument is still the element the handler is attached to.
		const inferred = found.param.type ? null : this.projectType(found.param);
		const type =
			found.param.type?.getText(this.sf) ??
			(inferred ? inferred.checker.typeToString(inferred.type) : '');
		if (
			/\b(?:Change|Form|Focus)Event<\s*(?:HTML(?:Input|TextArea|Select)Element\s*\|?\s*)+[,>]/.test(
				type,
			)
		)
			return true;
		const attribute = this.handlerAttribute(found.fn);
		if (!attribute || !/^on(Change|Input|Focus|Blur)/.test(attribute.name.getText(this.sf)))
			return false;
		const tag = attribute.parent.parent.tagName.getText(this.sf);
		return tag === 'input' || tag === 'textarea' || tag === 'select';
	}

	checkClass(node: ts.ClassDeclaration | ts.ClassExpression) {
		const base = node.heritageClauses?.find(
			(clause) => clause.token === ts.SyntaxKind.ExtendsKeyword,
		)?.types[0]?.expression;
		const name = base && this.calleeName(base);
		if (name !== 'Component' && name !== 'PureComponent') return;
		const boundary = node.members.some(
			(member) =>
				member.name &&
				/^(componentDidCatch|getDerivedStateFromError)$/.test(member.name.getText(this.sf)),
		);
		this.note(
			RULE.classComponent,
			'error',
			node,
			boundary
				? `Error boundary \`${node.name?.text ?? 'class'}\` needs a rewrite: use \`@try { … } @catch (error) { … }\` or Octane's \`ErrorBoundary\`.`
				: `Class component \`${node.name?.text ?? 'class'}\` needs a rewrite as a function component.`,
		);
	}

	checkDefaultProps(node: ts.BinaryExpression) {
		if (
			node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
			ts.isPropertyAccessExpression(node.left) &&
			node.left.name.text === 'defaultProps'
		) {
			this.note(
				RULE.defaultProps,
				'warning',
				node,
				'Function components ignore `defaultProps`; move the defaults into the props destructuring.',
			);
		}
	}

	// ---------------------------------------------------------------- JSX

	rewriteAttributes(node: ts.JsxAttributes, ctx: Context) {
		const element = node.parent;
		const tag = element.tagName.getText(this.sf);
		const intrinsic = /^[a-z]/.test(tag);
		// A library text field takes `onInput` for `onChange` as `<input>` does;
		// its other props are its own.
		const textField = !intrinsic && this.isTextFieldComponent(element);
		const spread = node.properties.some(ts.isJsxSpreadAttribute);
		const attributes = node.properties;

		let out = '';
		let cursor = node.getStart(this.sf);
		for (const attribute of attributes) {
			const start = attribute.getStart(this.sf);
			if (this.removed.has(attribute)) {
				// Drop the attribute and the whitespace on one side of it.
				if (out === '' && cursor === start) {
					cursor =
						attribute.end +
						(this.source.slice(attribute.end).length -
							this.source.slice(attribute.end).trimStart().length);
					if (attribute === attributes[attributes.length - 1]) cursor = attribute.end;
				} else {
					out = out.replace(/\s+$/, '') + this.source.slice(cursor, start).replace(/\s+$/, '');
					cursor = attribute.end;
				}
				continue;
			}
			out += this.source.slice(cursor, start);
			cursor = attribute.end;
			if (ts.isJsxSpreadAttribute(attribute) && this.changeSpreads.has(attribute)) {
				// On the spread's own line when it has one.
				this.count(RULE.nativeChange);
				const line = this.source.slice(this.source.lastIndexOf('\n', start - 1), start);
				out += 'onInput={onChange}' + (/^\n[ \t]*$/.test(line) ? line : ' ');
			}
			if (!ts.isJsxAttribute(attribute) || !(intrinsic || textField)) {
				out += this.emit(attribute, PLAIN);
				continue;
			}
			const name = attribute.name.getText(this.sf);
			if (
				name === 'className' &&
				intrinsic &&
				!ctx.descriptor &&
				this.target === 'tsrx' &&
				!attributeOf(element, 'class') &&
				!spread
			) {
				this.count(RULE.className);
				out += 'class' + this.emitInitializer(attribute);
			} else if ((name === 'onChange' || name === 'onChangeCapture') && this.isTextEntry(element)) {
				const input = name === 'onChange' ? 'onInput' : 'onInputCapture';
				if (attributeOf(element, input)) {
					this.note(
						RULE.nativeChange,
						'warning',
						attribute,
						`\`${name}\` beside \`${input}\` now fires on commit (blur), not per edit.`,
					);
					out += this.emit(attribute, PLAIN);
				} else {
					this.count(RULE.nativeChange);
					out += input + this.emitInitializer(attribute);
				}
			} else {
				out += this.emit(attribute, PLAIN);
			}
		}
		return out + this.source.slice(cursor, node.end);
	}

	emitInitializer(attribute: ts.JsxAttribute) {
		if (!attribute.initializer) return '';
		return (
			this.source.slice(attribute.name.end, attribute.initializer.getStart(this.sf)) +
			this.emit(attribute.initializer, PLAIN)
		);
	}

	/**
	 * Whether `element` is a text-entry control, where React's `onChange` fires
	 * per edit and the native `change` fires on commit.
	 */
	isTextEntry(element: ts.JsxOpeningLikeElement) {
		const tag = element.tagName.getText(this.sf);
		if (tag === 'textarea') return true;
		if (tag !== 'input' && !this.isTextFieldComponent(element)) return false;
		const type = attributeOf(element, 'type');
		if (!type) return true;
		const value = type.initializer;
		if (value && ts.isStringLiteral(value)) return TEXT_INPUT_TYPES.has(value.text);
		this.note(
			RULE.nativeChange,
			'warning',
			element,
			'This `<input>` has a dynamic `type`; if it can be a text field, use `onInput` for per-edit updates.',
		);
		return false;
	}

	rewriteElement(node: ts.JsxElement, ctx: Context) {
		if (this.bare.has(node)) {
			return (
				'<>' +
				this.span(node, node.openingElement.end, node.closingElement.getStart(this.sf), ctx) +
				'</>'
			);
		}
		const tag = node.openingElement.tagName;
		// A `descriptorChildren` component receives its children as elements, as
		// in React; `@if` or `@for` there would hand it a fragment instead.
		const declaration = ts.isIdentifier(tag) ? this.declarationOf(tag) : null;
		const entry = this.importOf(tag);
		const imported =
			entry && !entry.namespace && !entry.typeOnly && entry.module.startsWith('.') ? entry : null;
		if (
			(declaration &&
				(ts.isVariableDeclaration(declaration) || ts.isFunctionDeclaration(declaration)) &&
				this.descriptorComponents.has(declaration)) ||
			(this.hasReactBridge && this.reactCompatTag(tag)) ||
			(imported && this.options.descriptorChild?.(imported))
		) {
			return this.span(node, node.getStart(this.sf), node.end, DESCRIPTOR);
		}
		const name = this.calleeName(tag);
		const opening = node.openingElement;
		const radixSlot = ts.isPropertyAccessExpression(tag) && this.radixSlotMembers?.has(tag.name);
		if (ctx.template && (radixSlot || (ts.isIdentifier(tag) && isComponentName(tag.text)))) {
			const binding =
				declaration && ts.isFunctionDeclaration(declaration)
					? declaration.getStart(this.sf)
					: imported;
			if (radixSlot || (binding !== null && this.options.elementChild?.(binding))) {
				const child = this.singleElementChild(node);
				if (child) {
					this.count(RULE.elementChildProp);
					return (
						this.span(opening, opening.getStart(this.sf), opening.end - 1, ctx) +
						' children={' +
						this.emit(child, PLAIN) +
						'} />'
					);
				}
			}
		}
		if (name === 'StrictMode') {
			// Octane's StrictMode is a pass-through wrapper.
			this.count(RULE.strictMode);
			return this.emitChildren(node, ctx);
		}
		if (name === 'Suspense' && ctx.template) return this.rewriteSuspense(node);
		if (ts.isPropertyAccessExpression(tag) && tag.name.text === 'Consumer') {
			if (this.isContext(tag.expression)) return this.rewriteConsumer(node, ctx, tag);
		}
		return null;
	}

	/**
	 * Whether `node` is a React context, by where it comes from: a
	 * `createContext` call here, or an export the project knows is one. Only
	 * a package's export, which the codemod cannot see, is judged by its name.
	 */
	isContext(node: ts.Expression) {
		if (!ts.isIdentifier(node)) return false;
		const declaration = this.declarationOf(node);
		if (declaration && ts.isVariableDeclaration(declaration)) {
			return !!declaration.initializer && this.createsContext(declaration.initializer);
		}
		const entry = declaration ? this.imports.get(declaration) : null;
		if (!entry || entry.namespace) return false;
		const name = entry.imported === 'default' ? entry.local : entry.imported;
		return this.options.isContext?.(entry.module, entry.imported) ?? /Context$/.test(name);
	}

	/**
	 * Whether `node` evaluates to a `createContext` result on every branch.
	 */
	createsContext(node: ts.Expression): boolean {
		node = skipParens(node);
		if (ts.isConditionalExpression(node)) {
			return this.createsContext(node.whenTrue) && this.createsContext(node.whenFalse);
		}
		return ts.isCallExpression(node) && this.calleeName(node.expression) === 'createContext';
	}

	/**
	 * `typeof children === 'function'` also holds for a compiled children
	 * block, which renders through Octane rather than being called, so the
	 * check also asks `isChildrenBlock`.
	 */
	rewriteRenderProp(node: ts.BinaryExpression) {
		const op = node.operatorToken.kind;
		if (op !== ts.SyntaxKind.EqualsEqualsEqualsToken && op !== ts.SyntaxKind.EqualsEqualsToken) {
			return null;
		}
		if (!ts.isTypeOfExpression(node.left) || !ts.isStringLiteral(node.right)) return null;
		const operand = skipParens(node.left.expression);
		const name = ts.isIdentifier(operand)
			? operand.text
			: ts.isPropertyAccessExpression(operand)
				? operand.name.text
				: null;
		if (node.right.text !== 'function' || name !== 'children') return null;
		const parent = node.parent;
		if (ts.isBinaryExpression(parent) && /\bisChildrenBlock\(/.test(parent.getText(this.sf))) {
			return null;
		}
		this.count(RULE.renderProp);
		const check = this.require('octane', 'isChildrenBlock', false);
		return `(${this.span(node, node.getStart(this.sf), node.end, PLAIN)} && !${check}(${this.emit(operand, PLAIN)}))`;
	}

	/**
	 * The children of `node` as one renderable: the sole element, or a
	 * fragment around several.
	 */
	emitChildren(node: ts.JsxElement | ts.JsxFragment, ctx: Context) {
		const children = contentOf(node);
		if (children.length === 1 && isJsx(children[0])) return this.emit(children[0], ctx);
		const first = node.children[0];
		const last = node.children[node.children.length - 1];
		if (!first) return '<></>';
		return '<>' + this.span(node, first.pos, last.end, ctx) + '</>';
	}

	/**
	 * `<Ctx.Consumer>{(value) => …}</Ctx.Consumer>` reads the context in a
	 * nested template scope, where a hook is legal.
	 */
	rewriteConsumer(node: ts.JsxElement, ctx: Context, tag: ts.PropertyAccessExpression) {
		const children = contentOf(node);
		const render =
			children.length === 1 && ts.isJsxExpression(children[0]) ? children[0].expression : null;
		const fn = render && skipParens(render);
		if (
			!ctx.template ||
			!fn ||
			!(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) ||
			fn.parameters.length !== 1 ||
			ts.isBlock(fn.body)
		) {
			this.note(
				RULE.consumer,
				'error',
				node,
				'`Context.Consumer` does not exist in Octane; read the context with `use(Context)`.',
			);
			return null;
		}
		this.count(RULE.consumer);
		const useContext = this.require('octane', 'useContext', false);
		const param = this.emit(fn.parameters[0].name, PLAIN);
		const body = skipParens(fn.body);
		const output = isJsx(body) ? this.emit(body, TEMPLATE) : `<>{${this.emit(body, PLAIN)}}</>`;
		return `@{ const ${param} = ${useContext}(${this.emit(tag.expression, PLAIN)}); ${output} }`;
	}

	/**
	 * `<Suspense fallback={f}>…</Suspense>` is the template boundary
	 * `@try { … } @pending { f }`.
	 */
	rewriteSuspense(node: ts.JsxElement) {
		const attributes = node.openingElement.attributes.properties.filter(
			(a) => !this.removed.has(a),
		);
		const fallback = attributes[0];
		if (
			attributes.length !== 1 ||
			!ts.isJsxAttribute(fallback) ||
			fallback.name.getText(this.sf) !== 'fallback' ||
			!fallback.initializer
		) {
			return null;
		}
		let pending: string;
		const value = fallback.initializer;
		if (ts.isStringLiteral(value)) pending = `<>{${value.getText(this.sf)}}</>`;
		else if (ts.isJsxExpression(value) && value.expression) {
			const expression = skipParens(value.expression);
			if (isJsx(expression)) pending = this.relative(this.emit(expression, TEMPLATE), expression);
			else if (isNullish(expression)) pending = '<></>';
			else pending = `<>{${this.emit(expression, PLAIN)}}</>`;
		} else return null;
		this.count(RULE.try);
		const body = this.relative(this.emitChildren(node, TEMPLATE), node, this.indentUnit);
		return this.absolute(this.block('@try', body) + ' ' + this.block('@pending', pending), node);
	}

	// Directive text is built relative to its first line: line 1 carries no
	// indentation and every later line is indented from that line's level.
	// `absolute` re-anchors it where it lands in the module.

	/**
	 * Source text emitted for `node`, re-based so `node`'s own line is level 0.
	 *
	 * @param deeper how far inside `node`'s line the text's own
	 *   first line sat, such as the children of an element
	 */
	relative(text: string, node: ts.Node, deeper: string = '') {
		const from = this.indentOf(node) + deeper;
		return text
			.split('\n')
			.map((line, i) => {
				if (i === 0) return line;
				if (line.trim() === '') return '';
				return line.startsWith(from) ? line.slice(from.length) : line.trimStart();
			})
			.join('\n');
	}

	/**
	 * @param text relative text
	 * @param node the node it replaces
	 */
	absolute(text: string, node: ts.Node) {
		const indent = this.indentOf(node);
		return text
			.split('\n')
			.map((line, i) => (i === 0 || line === '' ? line : indent + line))
			.join('\n');
	}

	/**
	 * `head { body }` on one line when the body fits on one, else with the body
	 * on its own lines one level in.
	 *
	 * @param body relative text
	 */
	block(head: string, body: string) {
		if (!body.includes('\n') && !body.startsWith('@') && head.length + body.length < 80) {
			return `${head} { ${body} }`;
		}
		const unit = this.indentUnit;
		const lines = body.split('\n').map((line) => (line === '' ? '' : unit + line));
		return `${head} {\n${lines.join('\n')}\n}`;
	}

	/**
	 * The text before `node` on its line.
	 */
	linePrefix(node: ts.Node) {
		const start = node.getStart(this.sf);
		return this.source.slice(this.source.lastIndexOf('\n', start - 1) + 1, start);
	}

	indentOf(node: ts.Node) {
		const prefix = this.linePrefix(node);
		return prefix.slice(0, prefix.length - prefix.trimStart().length);
	}

	/**
	 * Template control flow for a JSX child hole.
	 */
	rewriteHole(node: ts.JsxExpression) {
		if (!node.expression || node.dotDotDotToken) return null;
		const directive = this.directive(node.expression);
		if (directive === null) return this.textHole(node, node.expression);
		// Comments the directive did not carry over sit before it, as JSX
		// comments, since this is a children position.
		const lost = this.lostComments(node.getStart(this.sf) + 1, node.end - 1, directive)
			.map((comment) => `{/* ${commentText(comment)} */}\n`)
			.join('');
		return this.absolute(lost + directive, node);
	}

	/**
	 * A child hole the module's types prove is a string, number, or bigint,
	 * spelled as text so it compiles to a text binding rather than a
	 * renderable hole. React renders those values as text too.
	 */
	textHole(node: ts.JsxExpression, expression: ts.Expression) {
		if (!this.strictTypes || isTextSpelling(expression)) return null;
		const kind = textKind(this.typeOf(expression));
		if (kind === 0) return null;
		this.count(RULE.text);
		const value = this.emit(expression, PLAIN);
		let text: string;
		if (kind === 1) {
			const bare =
				ts.isIdentifier(expression) ||
				ts.isPropertyAccessExpression(expression) ||
				ts.isElementAccessExpression(expression) ||
				ts.isCallExpression(expression) ||
				ts.isParenthesizedExpression(expression) ||
				ts.isNonNullExpression(expression);
			text = `${bare ? value : `(${value})`} as string`;
		} else if (
			this.declaresHere(this.checker.resolveName('String', node, ts.SymbolFlags.Value, false))
		) {
			text = `\`\${${value}}\``;
		} else {
			text = `String(${value})`;
		}
		return (
			this.span(node, node.getStart(this.sf), expression.getStart(this.sf), PLAIN) +
			text +
			this.span(node, expression.end, node.end, PLAIN)
		);
	}

	/**
	 * Whether evaluating `node` can only produce a boolean, so `node && <X />`
	 * renders nothing when it is falsy, exactly as `@if` does. React renders `0`
	 * and `NaN` from a numeric left side, so anything unproven stays a hole.
	 */
	isBoolean(node: ts.Expression, resolving = new Set<ts.Expression>()): boolean {
		node = skipParens(node);
		if (ts.isIdentifier(node)) {
			const value = this.constValue(node);
			if (value === null || resolving.has(value)) return false;
			resolving.add(value);
			const result = this.isBoolean(value, resolving);
			resolving.delete(value);
			return result;
		}
		if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) {
			return true;
		}
		if (ts.isPrefixUnaryExpression(node)) {
			return node.operator === ts.SyntaxKind.ExclamationToken;
		}
		if (ts.isBinaryExpression(node)) {
			switch (node.operatorToken.kind) {
				case ts.SyntaxKind.EqualsEqualsEqualsToken:
				case ts.SyntaxKind.ExclamationEqualsEqualsToken:
				case ts.SyntaxKind.EqualsEqualsToken:
				case ts.SyntaxKind.ExclamationEqualsToken:
				case ts.SyntaxKind.LessThanToken:
				case ts.SyntaxKind.LessThanEqualsToken:
				case ts.SyntaxKind.GreaterThanToken:
				case ts.SyntaxKind.GreaterThanEqualsToken:
				case ts.SyntaxKind.InstanceOfKeyword:
				case ts.SyntaxKind.InKeyword:
					return true;
				case ts.SyntaxKind.AmpersandAmpersandToken:
				case ts.SyntaxKind.BarBarToken:
					return this.isBoolean(node.left, resolving) && this.isBoolean(node.right, resolving);
			}
			return false;
		}
		if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
			return (
				node.expression.text === 'Boolean' &&
				this.declarationOf(node.expression)?.getSourceFile() === esLib()
			);
		}
		return false;
	}

	/**
	 * The type of `node` in the project's program, which resolves imports and
	 * packages, or null when the program does not have this module.
	 */
	projectType(node: ts.Node): { type: ts.Type; checker: ts.TypeChecker } | null {
		return projectTypeAt(node, this.options.types);
	}

	/**
	 * The type of `expression`, from the project's program when it has this
	 * module, else from the module's own.
	 */
	typeOf(expression: ts.Node) {
		return this.projectType(expression)?.type ?? this.checker.getTypeAtLocation(expression);
	}

	/**
	 * Comments in `[from, to)` whose text `kept` does not already carry.
	 */
	lostComments(from: number, to: number, kept: string) {
		const scanner = ts.createScanner(
			ts.ScriptTarget.Latest,
			false,
			ts.LanguageVariant.Standard,
			this.source,
			undefined,
			from,
			to - from,
		);
		const lost: string[] = [];
		for (
			let token = scanner.scan();
			token !== ts.SyntaxKind.EndOfFileToken;
			token = scanner.scan()
		) {
			if (
				token !== ts.SyntaxKind.SingleLineCommentTrivia &&
				token !== ts.SyntaxKind.MultiLineCommentTrivia
			) {
				continue;
			}
			const text = scanner.getTokenText();
			if (!kept.includes(text.replaceAll('\n', LITERAL_NEWLINE)) && !kept.includes(text))
				lost.push(text);
		}
		return lost;
	}

	/**
	 * The template directive equivalent to a renderable expression, as
	 * relative text, or null.
	 */
	directive(expression: ts.Expression): string | null {
		const node = skipParens(expression);
		if (ts.isConditionalExpression(node)) return this.ifDirective(node);
		if (
			ts.isBinaryExpression(node) &&
			node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
			(this.isBoolean(node.left) ||
				(this.strictTypes && isBooleanGuardType(this.typeOf(node.left))))
		) {
			const arm = this.arm(node.right);
			if (arm === null || arm === '') return null;
			this.count(RULE.if);
			return this.block(`@if (${this.emit(node.left, PLAIN)})`, arm);
		}
		if (ts.isCallExpression(node)) return this.forDirective(node);
		return null;
	}

	/**
	 * The relative template text for one directive arm: an element, a nested
	 * directive, or '' for nothing. An arm that is only a value is null; the
	 * caller decides whether it may become a `{value}` hole.
	 */
	arm(expression: ts.Expression): string | null {
		const node = skipParens(expression);
		if (isJsx(node)) return this.relative(this.emit(node, TEMPLATE), node);
		if (isNullish(node)) return '';
		const directive = this.directive(node);
		// A retained map is a JSX hole, which needs a fragment inside a directive arm.
		return directive?.startsWith('{') ? `<>${directive}</>` : directive;
	}

	/** The same unkeyed input keeps its live value when only its default changes. */
	private conditionalInputDefault(node: ts.ConditionalExpression) {
		const test = skipParens(node.condition);
		if (!ts.isIdentifier(test)) return null;
		const [yes, no] = [node.whenTrue, node.whenFalse].map((arm) => {
			const element = skipParens(arm);
			if (
				!ts.isJsxSelfClosingElement(element) ||
				!ts.isIdentifier(element.tagName) ||
				element.tagName.text !== 'input' ||
				element.typeArguments ||
				element.attributes.properties.length !== 1
			)
				return null;
			const [attribute] = element.attributes.properties;
			if (!ts.isJsxAttribute(attribute) || attribute.name.getText(this.sf) !== 'defaultValue')
				return null;
			const value = attribute.initializer;
			return value && ts.isStringLiteral(value) && !/[&\r\n]/.test(value.text) ? value.text : null;
		});
		if (
			yes === null ||
			no === null ||
			!fixedBinding(this.checker, test, node) ||
			!initializedBefore(this.checker, test, node) ||
			this.lostComments(node.getStart(this.sf), node.end, '').length
		)
			return null;
		this.count(RULE.if);
		const condition = this.emit(test, PLAIN);
		return `<input defaultValue={${condition} ? ${JSON.stringify(yes)} : ${JSON.stringify(no)}} />`;
	}

	ifDirective(node: ts.ConditionalExpression) {
		const shared = this.conditionalInputDefault(node);
		if (shared !== null) return shared;
		let whenTrue = this.arm(node.whenTrue);
		let whenFalse = this.arm(node.whenFalse);
		// A ternary between two values is a value; one with an element on
		// either side is control flow, and a value arm is a hole in a fragment:
		// a bare `{value}` arm is a JavaScript block, not a hole.
		if (whenTrue === null && whenFalse === null) return null;
		if ((whenTrue ?? '') === '' && (whenFalse ?? '') === '') return null;
		whenTrue ??= `<>{${this.emit(skipParens(node.whenTrue), PLAIN)}}</>`;
		whenFalse ??= `<>{${this.emit(skipParens(node.whenFalse), PLAIN)}}</>`;
		this.count(RULE.if);
		const condition = this.emit(node.condition, PLAIN);
		if (whenTrue === '') {
			const negated = /^[\w$.]+$/.test(condition) ? `!${condition}` : `!(${condition})`;
			return this.block(`@if (${negated})`, whenFalse);
		}
		const then = this.block(`@if (${condition})`, whenTrue);
		return whenFalse === '' ? then : then + ' ' + this.block('@else', whenFalse);
	}

	/**
	 * `items.map((item, i) => <Row key={item.id} />)` is
	 * `@for (const item of items; index i; key item.id) { <Row /> }`.
	 */
	forDirective(node: ts.CallExpression) {
		const callee = node.expression;
		if (
			!ts.isPropertyAccessExpression(callee) ||
			callee.name.text !== 'map' ||
			node.arguments.length !== 1
		) {
			return null;
		}
		const fn = node.arguments[0];
		if (!(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) return null;
		if (fn.parameters.length === 0 || fn.parameters.length > 2) return null;
		if (fn.parameters.some((p) => p.initializer || p.dotDotDotToken)) return null;
		const [item, index] = fn.parameters;
		if (index && !ts.isIdentifier(index.name)) return null;
		// `@for (const items of items)` would read `items` in its own TDZ.
		const bound = new Set([...bindingNames(item.name), ...(index ? bindingNames(index.name) : [])]);
		const iterable = callee.expression;
		const receiver = skipWrappers(iterable);
		const literal = ts.isArrayLiteralExpression(receiver) ? receiver : null;
		if (literal?.elements.some(ts.isOmittedExpression)) return null;
		if (literal && reads(iterable, (name) => bound.has(name.text))) {
			// Direct eval can observe the callback arguments or the generated loop's bindings.
			if (reads(node, (name) => name.text === 'eval' && !isPropertyName(name))) return null;
			if (
				reads(iterable, (name) => {
					if (!bound.has(name.text) || isPropertyName(name)) return false;
					const decl = this.declarationOf(name);
					return (
						decl?.getSourceFile() !== this.sf || decl.pos < iterable.pos || decl.end > iterable.end
					);
				})
			)
				return null;
		}
		// A `function` row sees its own `this` and `arguments`; an arm does not.
		if (ts.isFunctionExpression(fn) && usesOwnThis(fn.body)) return null;
		// A row that writes an outer variable (`n++`) needs every row to run in
		// order; an `@for` row can be skipped.
		if (this.writesOuter(fn)) return null;

		let setup: ts.Statement[] = [];
		let skipsRow = false;
		let output: ts.Expression;
		if (ts.isBlock(fn.body)) {
			const statements = fn.body.statements;
			const last = statements[statements.length - 1];
			if (!last || !ts.isReturnStatement(last) || !last.expression) return null;
			setup = statements.slice(0, -1);
			const exit = this.emptyArmExit(setup);
			if (exit === null) return null;
			skipsRow = exit;
			output = last.expression;
		} else output = fn.body;
		const root = skipParens(output);
		if (!isJsx(root) && !ts.isConditionalExpression(root)) return null;

		const attribute = rowKey(root);
		let key: ts.Expression | null = null;
		if (attribute) {
			// The original callback evaluates its guard before it reads the row key.
			if (skipsRow || ts.isConditionalExpression(root)) return null;
			const value = attribute.initializer;
			key = (value && ts.isJsxExpression(value) ? value.expression : value) ?? null;
			if (!key) return null;
			if (this.readsLocals(key, setup)) {
				this.note(
					RULE.for,
					'warning',
					attribute,
					'This row key reads a value computed in the row, so the list stays a `.map()`.',
				);
				return null;
			}
			if (setup.length && !this.rowKeyCanMove(key, item, iterable, setup)) {
				this.note(
					RULE.for,
					'warning',
					attribute,
					'This row runs setup before reading its key, so the list stays a `.map()`.',
				);
				return null;
			}
		}
		if (!literal) {
			this.note(
				RULE.for,
				'error',
				node,
				'This receiver can override .map() and inspect the React elements its callback returns. Keep this list in React or verify its map behavior before porting it.',
			);
		}
		if (attribute && key && !this.stableRowKey(key, item, iterable)) {
			const open = attribute.parent.parent;
			const children = ts.isJsxElement(root) ? root.children : [];
			const dynamic = (value: ts.JsxAttributeValue | ts.JsxChild | undefined) => {
				if (!value || ts.isJsxText(value) || ts.isStringLiteral(value)) return false;
				if (!ts.isJsxExpression(value)) return true;
				if (!value.expression) return false;
				const expression = skipWrappers(value.expression);
				return !(
					rowKeyLiteral(expression) ||
					(ts.isIdentifier(expression) &&
						fixedBinding(this.checker, expression, expression) &&
						initializedBefore(this.checker, expression, expression))
				);
			};
			if (
				!ts.isIdentifier(open.tagName) ||
				open.attributes.properties.some(
					(a) => a !== attribute && (ts.isJsxSpreadAttribute(a) || dynamic(a.initializer)),
				) ||
				children.some(dynamic)
			) {
				const ordered = this.orderedMapRow(node, fn, open, attribute, children);
				if (ordered !== null) return ordered;
				this.note(
					RULE.for,
					'error',
					attribute,
					'This row can evaluate JSX props or children before its key. Keep their original evaluation order before porting the list.',
				);
				return null;
			}
		}
		if (!literal) return null;
		if (fn.asteriskToken || fn.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) {
			this.note(
				RULE.for,
				'error',
				node,
				'An @for row would discard this callback’s promise or iterator. Review the retained .map() call for suspension or iteration.',
			);
			return null;
		}
		if (attribute) {
			this.removed.add(attribute);
			const opening = attribute.parent.parent;
			if (
				ts.isJsxOpeningElement(opening) &&
				opening.attributes.properties.length === 1 &&
				this.calleeName(opening.tagName) === 'Fragment'
			)
				this.bare.add(opening.parent);
		}
		const arm = ts.isConditionalExpression(root)
			? this.ifDirective(root)
			: this.relative(this.emit(root, TEMPLATE), root);
		if (arm === null) return null;
		if (!literal.elements.some(ts.isSpreadElement)) {
			if (index && this.patternReadsOrdinal(item.name, index)) {
				this.note(
					MAP_PARAMETER_TDZ,
					'error',
					node,
					'An @for row initializes its index before this parameter pattern can read it. Review the original callback’s initialization order.',
				);
			}
			const mutable = (name: ts.Identifier) =>
				!fixedBinding(this.checker, name, name, undefined, (use) => !isPropertyName(use));
			if (
				(index && ts.isIdentifier(index.name) && mutable(index.name)) ||
				(!ts.isIdentifier(item.name) &&
					reads(
						item.name,
						(name) =>
							ts.isBindingElement(name.parent) && name.parent.name === name && mutable(name),
					))
			) {
				this.note(
					MAP_PARAMETER_WRITE,
					'error',
					node,
					'Cannot prove this map parameter stays unchanged in an @for row. Exclude the source from migration or keep the parameter unchanged.',
				);
			}
		}
		this.count(RULE.for);
		let source = this.emit(callee.expression, PLAIN);
		if (callee.questionDotToken) source = `${source} ?? []`;
		let header = `@for (const ${this.emit(item.name, PLAIN)} of ${source}`;
		if (index) header += `; index ${index.name.getText(this.sf)}`;
		if (key) header += `; key ${this.emit(key, PLAIN)}`;
		else if (this.strong) {
			this.note(
				RULE.for,
				'warning',
				node,
				'Strong mode needs a keyed `@for`; add `key <item id>` to the header.',
			);
		}
		header += ')';
		if (setup.length === 0) return this.block(header, arm);
		const statements = this.relative(
			this.span(fn.body, setup[0].getStart(this.sf), setup[setup.length - 1].end, PLAIN),
			setup[0],
		);
		return this.block(header, statements + '\n' + arm);
	}

	private patternReadsOrdinal(pattern: ts.BindingName, ordinal: ts.ParameterDeclaration): boolean {
		const readsOrdinal = (expr: ts.Expression | undefined): boolean => {
			if (!expr) return false;
			const read = skipWrappers(expr);
			if (ts.isIdentifier(read)) return this.declarationOf(read) === ordinal;
			if (ts.isTypeOfExpression(read)) return readsOrdinal(read.expression);
			return (
				ts.isBinaryExpression(read) &&
				read.operatorToken.kind === ts.SyntaxKind.PlusToken &&
				((rowKeyLiteral(read.right) && readsOrdinal(read.left)) ||
					(rowKeyLiteral(read.left) && readsOrdinal(read.right)))
			);
		};
		return (
			!ts.isIdentifier(pattern) &&
			pattern.elements.some(
				(element) =>
					ts.isBindingElement(element) &&
					(readsOrdinal(element.initializer) ||
						(element.propertyName &&
							ts.isComputedPropertyName(element.propertyName) &&
							readsOrdinal(element.propertyName.expression)) ||
						this.patternReadsOrdinal(element.name, ordinal)),
			)
		);
	}

	/**
	 * Whether `fn` assigns a variable declared outside it.
	 */
	writesOuter(fn: ts.ArrowFunction | ts.FunctionExpression) {
		const visit: (node: ts.Node) => boolean = (node) => {
			let target: ts.Expression | null = null;
			if (
				ts.isBinaryExpression(node) &&
				node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
				node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
			) {
				target = node.left;
			} else if (
				(ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
				(node.operator === ts.SyntaxKind.PlusPlusToken ||
					node.operator === ts.SyntaxKind.MinusMinusToken)
			) {
				target = node.operand;
			}
			const assigned = target && skipParens(target);
			if (assigned && ts.isIdentifier(assigned)) {
				const declaration = this.declarationOf(assigned);
				if (declaration && (declaration.pos < fn.pos || declaration.end > fn.end)) return true;
			}
			return ts.forEachChild(node, visit) ?? false;
		};
		return visit(fn.body);
	}

	/** True for an early empty exit, null for an early exit with a value. */
	emptyArmExit(statements: ts.Statement[]): boolean | null {
		let exits = false;
		const exitsWithValue = (node: ts.Node): true | undefined => {
			if (isFunctionLike(node)) return;
			if (ts.isReturnStatement(node)) {
				exits = true;
				return node.expression && !isNullish(node.expression) ? true : undefined;
			}
			return node.forEachChild(exitsWithValue);
		};
		return statements.some(exitsWithValue) ? null : exits;
	}

	// The automatic JSX runtime receives props (including children) before its
	// separate key argument. Keep a block-body map so the compiler builds every
	// row value before rendering any of them.
	private orderedMapRow(
		call: ts.CallExpression,
		fn: ts.ArrowFunction | ts.FunctionExpression,
		open: ts.JsxOpeningLikeElement,
		key: ts.JsxAttribute,
		children: readonly ts.JsxChild[],
	) {
		const tag = open.tagName;
		const props = open.attributes.properties;
		const declaration = ts.isIdentifier(tag) && this.declarationOf(tag);
		if (
			!ts.isArrowFunction(fn) ||
			ts.isBlock(fn.body) ||
			fn.modifiers?.length ||
			!ts.isIdentifier(tag) ||
			open.typeArguments ||
			!(
				(declaration && ts.isFunctionDeclaration(declaration)) ||
				/^[a-z][a-z0-9]*$/.test(tag.text)
			) ||
			!this.options.automaticReactJsx ||
			this.lostComments(call.getStart(this.sf), call.end, '').length
		)
			return null;
		const names = new Set<string>();
		for (const prop of props) {
			if (
				!ts.isJsxAttribute(prop) ||
				!ts.isIdentifier(prop.name) ||
				names.has(prop.name.text) ||
				(prop.initializer && hasJsx(prop.initializer)) ||
				/^(?:children|ref|dangerouslySetInnerHTML)$|^on[A-Z]/.test(prop.name.text)
			)
				return null;
			names.add(prop.name.text);
		}
		const content = withoutJsxIndentation(children);
		const [child] = content;
		if (
			content.length &&
			!(
				content.length === 1 &&
				ts.isJsxExpression(child) &&
				child.expression &&
				!child.dotDotDotToken &&
				!hasJsx(child.expression)
			)
		)
			return null;
		const fields = props.filter((prop) => prop !== key).map((prop) => this.emit(prop, PLAIN));
		if (child) fields.push('children=' + this.emit(child, DESCRIPTOR));
		fields.push(this.emit(key, PLAIN));
		const row = '<' + this.emit(tag, PLAIN) + ' ' + fields.join(' ') + ' />';
		const head =
			this.span(call, call.getStart(this.sf), fn.getStart(this.sf), PLAIN) +
			this.span(fn, fn.getStart(this.sf), fn.body.getStart(this.sf), PLAIN);
		const tail = this.span(call, fn.end, call.end, PLAIN);
		return '{' + head + '{ return ' + row + '; }' + tail + '}';
	}

	private stableRowKey(key: ts.Expression, item: ts.ParameterDeclaration, iterable: ts.Expression) {
		if (rowKeyLiteral(key)) return true;
		key = skipWrappers(key);
		const source = skipWrappers(iterable);
		return (
			ts.isIdentifier(key) &&
			this.declarationOf(key) === item &&
			ts.isArrayLiteralExpression(source) &&
			source.elements.every(rowKeyLiteral) &&
			fixedBinding(this.checker, key, key)
		);
	}

	/** An @for header evaluates its key before the row body runs. */
	rowKeyCanMove(
		key: ts.Expression,
		item: ts.ParameterDeclaration,
		iterable: ts.Expression,
		setup: ts.Statement[],
	) {
		if (!ts.isIdentifier(item.name)) return false;
		if (this.stableRowKey(key, item, iterable)) return true;

		// Even an accessor key can precede initialization that reads nothing.
		return (
			setup.every(
				(statement) =>
					ts.isVariableStatement(statement) &&
					(statement.declarationList.flags & ts.NodeFlags.BlockScoped) === ts.NodeFlags.Const &&
					statement.declarationList.declarations.every(
						({ name, initializer }) =>
							ts.isIdentifier(name) && initializer !== undefined && rowKeyLiteral(initializer),
					),
			) && !reads(key, (name) => name.text === 'eval' && !isPropertyName(name))
		);
	}

	readsLocals(expression: ts.Node, statements: ts.Statement[]) {
		const declared = new Set(
			statements
				.filter(ts.isVariableStatement)
				.flatMap((statement) => statement.declarationList.declarations)
				.flatMap((declaration) => bindingNames(declaration.name)),
		);
		return reads(expression, (name) => declared.has(name.text));
	}

	// ---------------------------------------------------------------- components

	/**
	 * Rewrite a component whose last statement returns JSX as a template body:
	 * `function C() { setup; return <div /> }` is `function C() @{ setup; <div /> }`.
	 */
	rewriteComponent(node: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction) {
		if (!node.body || !this.isComponent(node)) return null;
		if (node.asteriskToken || node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword))
			return null;
		const body = node.body;

		if (!ts.isBlock(body)) {
			const inner = skipParens(body);
			const output = this.output(inner);
			if (output === null) return null;
			const head = this.head(node, body.getStart(this.sf));
			this.markTemplate();
			if (inner !== body && this.startsLine(inner)) {
				// `=> (\n\t<div />\n)` keeps its layout with the parens as braces.
				return (
					head +
					'@{' +
					this.source.slice(body.getStart(this.sf) + 1, inner.getStart(this.sf)) +
					output +
					this.source.slice(inner.end, body.end - 1).replace(/\)\s*$/, '') +
					'}'
				);
			}
			return head + '@{ ' + output + ' }';
		}

		const statements = body.statements;
		const last = statements[statements.length - 1];
		if (!last || !ts.isReturnStatement(last) || !last.expression) return null;
		const guard = statements.findIndex((s, i) => i < statements.length - 1 && guardReturn(s));
		if (guard !== -1) return this.rewriteGuards(node, body, guard);
		// A template body has one output; any other early `return <A />` would
		// render through runtime descriptors, so the plain function stays.
		if (returnsJsx(statements.slice(0, -1))) return null;
		const inner = skipParens(last.expression);
		let output = this.output(inner);
		if (output === null) return null;
		const head = this.head(node, body.getStart(this.sf));
		this.markTemplate();

		if (this.startsLine(inner)) {
			// `return (\n\t\t<div>…` sits one level deeper than the statements.
			output = this.absolute(this.relative(output, inner), last);
		}
		// A comment inside `return ( … )` becomes a setup comment.
		const indent = this.indentOf(last);
		const lost = [
			...this.lostComments(last.getStart(this.sf), inner.getStart(this.sf), output),
			...this.lostComments(inner.end, last.end, output),
		];
		output =
			lost.map((comment) => comment.replaceAll('\n', '\n' + indent) + '\n' + indent).join('') +
			output;
		const previous = statements[statements.length - 2];
		const setup = previous ? this.span(body, body.getStart(this.sf) + 1, previous.end, PLAIN) : '';
		const gap = this.source.slice(
			previous ? previous.end : body.getStart(this.sf) + 1,
			last.getStart(this.sf),
		);
		return head + '@{' + setup + gap + output + this.source.slice(last.end, body.end - 1) + '}';
	}

	/**
	 * A component with `if (c) return <A />;` guards: each becomes
	 * `@if (c) { <A /> } @else { …the rest }`, since a template body has one
	 * output. The setup before the first guard stays as it was.
	 *
	 * @param first the index of the first guard
	 */
	rewriteGuards(
		node: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction,
		body: ts.Block,
		first: number,
	) {
		const statements = body.statements;
		const last = statements[statements.length - 1] as ts.ReturnStatement;
		// Setup before the first guard stays in the body, which may return a
		// value early; the rest moves into arms, which may only return nothing.
		const rest = statements.slice(first + 1, -1).filter((statement) => !guardReturn(statement));
		if (returnsJsx(statements.slice(0, first)) || this.emptyArmExit(rest) === null) return null;
		const output = this.arm(last.expression as ts.Expression);
		if (output === null) return null;
		const chain: (from: number) => string = (from) => {
			let at = from;
			while (at < statements.length - 1 && !guardReturn(statements[at])) at++;
			// Comments before the first guard stay in the body's own text.
			const lead =
				from > first
					? this.lostComments(statements[from - 1].end, statements[from].getStart(this.sf), '')
					: [];
			const prefix =
				lead.map((comment) => comment + '\n').join('') +
				(at > from
					? this.relative(
							this.span(body, statements[from].getStart(this.sf), statements[at - 1].end, PLAIN),
							statements[from],
						) + '\n'
					: '');
			if (at === statements.length - 1) return prefix + output;
			const guard = statements[at] as ts.IfStatement;
			this.count(RULE.if);
			const then = this.block(
				`@if (${this.emit(guard.expression, PLAIN)})`,
				this.arm(guardReturn(guard) as ts.Expression) as string,
			);
			const rest = chain(at + 1);
			return prefix + (rest === '' ? then : then + ' ' + this.block('@else', rest));
		};
		const directive = this.absolute(chain(first), statements[first]);
		const head = this.head(node, body.getStart(this.sf));
		this.markTemplate();
		const previous = statements[first - 1];
		const before = previous ? this.span(body, body.getStart(this.sf) + 1, previous.end, PLAIN) : '';
		const gap = this.source.slice(
			previous ? previous.end : body.getStart(this.sf) + 1,
			statements[first].getStart(this.sf),
		);
		return head + '@{' + before + gap + directive + this.source.slice(last.end, body.end - 1) + '}';
	}

	markTemplate() {
		this.template = true;
		this.count(RULE.component);
	}

	/**
	 * A component's returned expression as template output, at the position
	 * and indentation `node` had, or null when it is not a single renderable.
	 */
	output(node: ts.Expression) {
		if (isJsx(node)) return this.emit(node, TEMPLATE);
		if (ts.isConditionalExpression(node) || ts.isCallExpression(node)) {
			const directive = this.directive(node);
			return directive === null ? null : this.absolute(directive, node);
		}
		return null;
	}

	startsLine(node: ts.Node) {
		return this.linePrefix(node).trim() === '';
	}

	/**
	 * Whether `node` is a component definition: a capitalized function, or the
	 * function passed to `memo` / `forwardRef`, or a default-exported one.
	 */
	isComponent(node: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction) {
		if (node.name && isComponentName(node.name.text)) return true;
		const parent = node.parent;
		if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
			return isComponentName(parent.name.text);
		}
		if (ts.isCallExpression(parent) && parent.arguments[0] === node) {
			const name = this.calleeName(parent.expression);
			if (name === 'memo' || name === 'forwardRef') return true;
		}
		if (ts.isExportAssignment(parent)) return true;
		if (ts.isFunctionDeclaration(node) && !node.name) return true;
		return false;
	}
}
