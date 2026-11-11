import {
	forwardedProps,
	literalSvgAttribute,
	nativeOutputOwner,
	renderUses,
	svgLocalReads,
} from './forwarded-props.js';
import { reactRenderer, staticReactProps } from './react-renderer.js';
import { localUses, walkLocalValues } from './local-uses.js';
import { isWrapper, skipWrappers } from './expression-wrappers.js';
import ts from 'typescript';
import { effectReceivers, fixedBinding } from './effect-receivers.js';
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
	const same = nodeSpanning(types.sourceFile, node.getStart(), node.end);
	if (same?.kind !== node.kind) return null;
	return { type: types.checker.getTypeAtLocation(same), checker: types.checker };
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

let es5: ts.SourceFile | undefined;

/**
 * The ES5 library, parsed once and shared by every module's program, so
 * array and string members have types.
 */
function esLib() {
	const file = ts.getDefaultLibFilePath({}).replace(/[^/\\]+$/, 'lib.es5.d.ts');
	es5 ??= ts.createSourceFile(
		'lib.es5.d.ts',
		ts.sys.readFile(file) as string,
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

function nativeReactCompat(module: string, name: string) {
	return name === 'ReactCompat' && (module === 'octane/react' || module === 'octane/react/server');
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
	fixedGuard: (name: ts.Identifier) => boolean,
	truthTest = false,
): boolean {
	expr = skipWrappers(expr);
	if (ts.isStringLiteralLike(expr)) return true;
	if (ts.isIdentifier(expr)) return truthTest && fixedGuard(expr);
	if (ts.isPrefixUnaryExpression(expr) && expr.operator === ts.SyntaxKind.ExclamationToken)
		return svgClassToken(expr.operand, fixedGuard, true);
	if (ts.isConditionalExpression(expr))
		return (
			svgClassToken(expr.condition, fixedGuard, true) &&
			svgClassToken(expr.whenTrue, fixedGuard, truthTest) &&
			svgClassToken(expr.whenFalse, fixedGuard, truthTest)
		);
	if (ts.isBinaryExpression(expr)) {
		const op = expr.operatorToken.kind;
		if (op === ts.SyntaxKind.AmpersandAmpersandToken || op === ts.SyntaxKind.BarBarToken)
			return (
				svgClassToken(
					expr.left,
					fixedGuard,
					truthTest || op === ts.SyntaxKind.AmpersandAmpersandToken,
				) && svgClassToken(expr.right, fixedGuard, truthTest)
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

/**
 * The attribute an element sets by `name`.
 */
function attributeOf(element: ts.JsxOpeningLikeElement, name: string) {
	return element.attributes.properties.find(
		(a): a is ts.JsxAttribute =>
			ts.isJsxAttribute(a) && ts.isIdentifier(a.name) && a.name.text === name,
	);
}

/**
 * The elements a list row can render: the row itself, or each arm of a
 * conditional row. Null when an arm renders anything else.
 */
function rowElements(
	node: ts.Expression,
): (ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment)[] | null {
	node = skipParens(node);
	if (isJsx(node)) return [node];
	if (isNullish(node)) return [];
	if (!ts.isConditionalExpression(node)) return null;
	const whenTrue = rowElements(node.whenTrue);
	const whenFalse = rowElements(node.whenFalse);
	return whenTrue && whenFalse && [...whenTrue, ...whenFalse];
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

/**
 * Whether any `return` in `statements`, outside nested functions, returns
 * JSX.
 */
function returnsJsx(statements: readonly ts.Statement[]) {
	const hasJsx: (node: ts.Node) => boolean = (node) =>
		isJsx(node) || (ts.forEachChild(node, hasJsx) ?? false);
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

/**
 * Whether an identifier is read in a type, where an import needs no value.
 * A `typeof X` query is a type, which `import type` serves; `extends Base`
 * reads a value, so heritage counts as one.
 */
function inTypeNode(node: ts.Identifier) {
	let parent = node.parent;
	while (ts.isQualifiedName(parent)) parent = parent.parent;
	return ts.isTypeNode(parent) && !ts.isExpressionWithTypeArguments(parent);
}

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
	readonly options: TransformOptions;
	readonly target: 'tsrx' | 'tsx';
	readonly strong: boolean;
	readonly effectAliases?: Map<ts.Identifier, string>;
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
	readonly islands = new Set<ts.JsxElement | ts.JsxSelfClosingElement>();
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
		if (options.captureEffectReceivers) this.effectAliases = new Map();
		this.target = options.target ?? 'tsrx';
		this.strong = options.strong === true;
		this.strictTypes = options.strictNullChecks === true && /\.[cm]?tsx?$/.test(filename);
		const { sf, checker } = bind(filename, source);
		this.sf = sf;
		this.checker = checker;
		this.indentUnit = /^\t/m.test(source) ? '\t' : '  ';
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
		const tsrx =
			this.template || (this.target === 'tsrx' && (this.hasJsx || /\.[jt]sx$/.test(this.filename)));
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
						(sharedInput) => {
							safeStoreUses ??= storeHookUses(
								this.sf,
								this.checker,
								(fn) => this.isComponent(fn),
								(expr) => this.typeOf(expr),
							);
							pending.clear();
							return safeStoreUses(declaration, sharedInput, (elements) => {
								const args = elements.map((element) => this.storeReactDescriptor(element));
								if (!args.every((arg) => arg !== null)) return false;
								for (const [index, arg] of args.entries()) pending.set(elements[index], arg);
								return true;
							});
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
		let hasEval = false;
		const submitEvents = this.source.includes('SubmitEvent');
		const fields: ts.JsxOpeningLikeElement[] = [];
		/** Values read as an element: cloned, inspected, or a `render` prop. */
		const elements: ts.Expression[] = [];
		const visit = (node: ts.Node) => {
			if (submitEvents && ts.isParameter(node)) this.checkSubmitParameter(node);
			if (ts.isIdentifier(node) && declaresName(node)) this.declared.add(node.text);
			if (this.options.pathSvgAdapter && ts.isIdentifier(node) && node.text === 'eval')
				hasEval = true;
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
				const eligible = refs.map((ref) =>
					this.nativePathSvgUse(ref, this.localUses, (tag, prop) =>
						unknownSvgSlots.set(
							ref,
							` Cannot prove where <${tag.text}> renders its ${prop === 'children' ? 'children' : prop + ' prop'}.`,
						),
					),
				);
				if (!eligible.length || eligible.includes(false)) continue;
				const native = this.options.pathSvgAdapter(binding.module);
				if (!native) continue;
				this.pathSvgImports.set(declaration.parent, native);
				for (const ref of refs) pathSvgTags.add(ref);
			}
		}
		const bareSvgImports = new Set<ts.Node>();
		if (this.target === 'tsrx' && /\.(?:jsx?|tsx)$/.test(this.filename)) {
			// An explicit loader, query, or fragment doesn't use the bare SVG convention.
			const bare = /^#?[^!?#]*\.svg$/i;
			for (const [declaration, entry] of this.imports) {
				if (entry.typeOnly || entry.imported !== 'default' || !bare.test(entry.module)) continue;
				const statement = ts.findAncestor(declaration, ts.isImportDeclaration);
				if (!statement?.attributes && bare.test(this.resolve(entry.module) ?? entry.module))
					bareSvgImports.add(declaration);
			}
		}
		for (const field of fields) {
			if (pathSvgTags.has(field.tagName)) this.count('svg-paths');
			else if (bareSvgImports.size && isBareSvgTag(field.tagName, this.checker, bareSvgImports)) {
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
			const reason = !this.hostsInReact(element)
				? `\`<${text}>\` takes children or props that Octane renders, which cannot cross into a React island.`
				: this.options.reactCompat
					? null
					: `\`<${text}>\` can render in a \`ReactCompat\` island only with React and React DOM 19.2 or newer in the React 19 series.`;
			if (reason === null) {
				port.islands++;
				this.islands.add(element);
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

	nativePathSvgUse(
		ref: ts.Identifier,
		uses: ReturnType<typeof localUses>,
		unproven: (tag: ts.Identifier, prop: string) => void,
	) {
		const tag = ref.parent;
		if (!ts.isJsxSelfClosingElement(tag) || tag.tagName !== ref || tag.typeArguments) return false;
		const supported = tag.attributes.properties.every((attr) => {
			if (!ts.isJsxAttribute(attr) || !ts.isIdentifier(attr.name)) return false;
			const value = attr.initializer;
			if (attr.name.text === 'className')
				return (
					!!value &&
					(ts.isStringLiteral(value) ||
						(ts.isJsxExpression(value) &&
							!!value.expression &&
							this.svgClassName(value.expression)))
				);
			return attr.name.text === 'aria-hidden' && literalSvgAttribute(attr);
		});
		if (!supported) return false;
		return this.nativeSvgOutput(tag, uses, unproven);
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
	private svgClassName(expr: ts.Expression) {
		if (ts.isIdentifier(expr)) return true;
		if (ts.isPropertyAccessExpression(expr)) return this.svgCssClass(expr);
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
				svgClassToken(arg, (name) =>
					fixedBinding(this.checker, name, expr, (this.fixedSvgParameters ??= new Map())),
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

	private svgRead?: ReturnType<typeof svgLocalReads>;
	private nativeSvgProps?: ReturnType<typeof forwardedProps>;
	private provenSvgOwners?: Set<ts.Node>;
	private nativeSvgOutput(
		element: ts.JsxSelfClosingElement,
		uses: ReturnType<typeof localUses>,
		unproven: (tag: ts.Identifier, prop: string) => void,
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
			if (!known) unproven(tag, prop);
			return known;
		};
		this.svgRead ??= svgLocalReads(
			this.checker,
			uses,
			typeOf,
			(type) => ts.isTypeReferenceNode(type) && this.reactTypeName(type.typeName) === 'ReactNode',
		);
		const first = nativeOutputOwner(this.svgRead(element) ?? element, slot, destination);
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
		const callbacks = new Map<ts.Node, string>();
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
								textKind(this.typeOf(value)) !== 0;
							return !primitive || visit(field);
						}
						if (
							['jsx', 'OctaneJsx'].some((name) =>
								this.checker.resolveName(name, wrapper.body, ts.SymbolFlags.Value, false),
							)
						)
							return true;
						callbacks.set(wrapper.body, wrapper.args);
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
		for (const [body, args] of callbacks) this.reactRendererBodies.set(body, args);
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
	 * Request an import from Octane and return the local name to use.
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
		if (this.effectAliases) {
			if (ts.isIdentifier(node)) {
				const alias = this.effectAliases.get(node);
				if (alias) return alias;
			}
			if (ts.isBlock(node)) {
				const captures = effectReceivers(
					node,
					this.checker,
					(name) => {
						const hook = this.callee(name);
						return hook?.module === 'react' ? hook.name : null;
					},
					this.effectAliases,
				);
				if (captures.length) {
					const indent = this.indentOf(node) + this.indentUnit;
					const rest = this.span(node, node.getStart(this.sf) + 1, node.end, ctx);
					return (
						'{\n' +
						indent +
						captures.join('\n' + indent) +
						(/^\s*\n/.test(rest) ? '' : '\n' + indent) +
						rest
					);
				}
			}
		}
		if (ts.isImportDeclaration(node)) return this.rewriteImport(node);
		if (ts.isExportDeclaration(node) && node.moduleSpecifier) return this.rewriteReexport(node);
		if (ts.isCallExpression(node)) return this.rewriteCall(node);
		if (ts.isPropertyAccessExpression(node)) return this.rewriteMember(node);
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
			const island = this.require('octane/react', 'ReactCompat', false);
			const content = this.span(node, node.getStart(this.sf), node.end, PLAIN);
			const tag = ts.isJsxElement(node) ? node.openingElement.tagName : node.tagName;
			const imported = this.importOf(ts.isPropertyAccessExpression(tag) ? tag.expression : tag);
			const name = ts.isPropertyAccessExpression(tag) ? tag.name.text : imported?.imported;
			if (
				this.options.reactIntlAdapter &&
				imported?.module === 'react-intl' &&
				/^Formatted[A-Z]/.test(name ?? '')
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
		if (clause && bindings && ts.isNamedImports(bindings)) {
			const moved = new Map<string, string[]>();
			const kept: ts.ImportSpecifier[] = [];
			const originals: string[] = [];
			let store = false;
			for (const item of bindings.elements) {
				const alias = this.originalStoreTags.get(item);
				if (alias)
					originals.push(`${(item.propertyName ?? item.name).getText(this.sf)} as ${alias}`);
				const hook = this.nativeStoreHooks.get(item);
				const dest =
					hook?.from ?? (this.nativeIntl.has(item) ? this.options.reactIntlAdapter : undefined);
				if (!dest) {
					kept.push(item);
					continue;
				}
				store ||= !!hook;
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
				this.count(store ? 'store-hook' : 'react-intl');
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
		const module = (node.moduleSpecifier as ts.StringLiteral).text;
		const exports = node.exportClause;
		if (
			module === 'react' &&
			exports &&
			ts.isNamedExports(exports) &&
			exports.elements.some((item) =>
				['SubmitEvent', 'SubmitEventHandler'].includes((item.propertyName ?? item.name).text),
			)
		) {
			this.note(
				RULE.unsupported,
				'error',
				node,
				'Review the React submit event re-export and define an explicit native event type.',
			);
			return null;
		}
		const mapped = REACT_MODULES[module];
		if (mapped) {
			this.count(RULE.import);
			return this.replaceSpecifier(node, node.moduleSpecifier as ts.Expression, mapped);
		}
		return (
			this.rewritePackageNames(node, module) ??
			this.rewriteSpecifier(node, node.moduleSpecifier as ts.Expression)
		);
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
		this.count(RULE.import);
		const qualifier = node.qualifier;
		const name = qualifier && ts.isIdentifier(qualifier) ? qualifier.text : null;
		if (specifier.text === 'react' && !node.isTypeOf) {
			const event = this.nativeSubmitType(node, name);
			if (event) return event;
		}
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
			return this.require(this.importOf(node.expression)!.module, 'ReactCompat', false);
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
		const event = this.nativeSubmitType(node, imported);
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
			node.arguments.length === 1 &&
			this.isRoot(node.expression.expression)
		) {
			return this.rewriteRootRender(node, node.arguments[0]);
		}
		const callee = this.callee(node.expression);
		// An Octane hook without a list already means "inferred".
		if (!callee || callee.module === 'octane') return null;
		const name = callee.name;
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
		if (name in DEPENDENCY_HOOKS) return this.rewriteDependencies(node, name);
		return null;
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
	 * React runs a hook with an omitted or undefined list on every render.
	 * Octane spells that schedule with `null`, including in Strong migrations.
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
				'null' +
				this.source.slice(deps.end, node.end)
			);
		}
		if (node.arguments.length !== depsIndex) return null;
		this.count(RULE.deps);
		const last = node.arguments[node.arguments.length - 1];
		return (
			this.span(node, node.getStart(this.sf), last.end, PLAIN) +
			', null' +
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

	/**
	 * Whether `node` is a root `createRoot` made: the call itself, or a
	 * `const` bound to it.
	 */
	isRoot(node: ts.Expression) {
		node = skipParens(node);
		const value = ts.isIdentifier(node) ? this.constValue(node) : node;
		return (
			!!value && ts.isCallExpression(value) && this.calleeName(value.expression) === 'createRoot'
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

	rewriteStatement(node: ts.ExpressionStatement) {
		const call = node.expression;
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

	private nativeSubmitType(node: ts.NodeWithTypeArguments, name: string | null) {
		if (name !== 'SubmitEvent' && name !== 'SubmitEventHandler') return null;
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
		const target = node.typeArguments?.[0];
		const type = (name: string) =>
			ts.isExternalModule(this.sf)
				? this.require('octane', name, true)
				: `import(${this.quote}octane${this.quote}).${name}`;
		const host = target ? this.emit(target, PLAIN) : 'globalThis.Element';
		const event = `${type('NativeEvent')}<${host}, globalThis.SubmitEvent>`;
		return name === 'SubmitEventHandler' ? `${type('EventHandler')}<${event}>` : event;
	}

	private hasSubmitType(type: ts.TypeNode | undefined, eventValue = false) {
		if (!type) return false;
		let aliases: Set<ts.TypeAliasDeclaration> | undefined;
		const submit = (name: string | null) =>
			name === 'SubmitEvent' || (!eventValue && name === 'SubmitEventHandler');
		const visit = (node: ts.Node): boolean => {
			if (ts.isTypeReferenceNode(node)) {
				if (submit(this.reactTypeName(node.typeName))) return true;
				const alias = ts.isIdentifier(node.typeName) && this.declarationOf(node.typeName);
				if (alias && ts.isTypeAliasDeclaration(alias) && !aliases?.has(alias)) {
					(aliases ??= new Set()).add(alias);
					if (visit(alias.type)) return true;
				}
			}
			if (
				ts.isImportTypeNode(node) &&
				!node.isTypeOf &&
				ts.isLiteralTypeNode(node.argument) &&
				ts.isStringLiteral(node.argument.literal) &&
				node.argument.literal.text === 'react' &&
				node.qualifier &&
				ts.isIdentifier(node.qualifier) &&
				submit(node.qualifier.text)
			)
				return true;
			return (
				(!eventValue ||
					ts.isParenthesizedTypeNode(node) ||
					ts.isUnionTypeNode(node) ||
					ts.isIntersectionTypeNode(node)) &&
				ts.forEachChild(node, visit) === true
			);
		};
		return visit(type);
	}

	private isSubmitParameter(param: ts.ParameterDeclaration) {
		if (this.hasSubmitType(param.type, true)) return true;
		const handler = param.parent;
		if (handler.parameters[0] !== param) return false;
		if (ts.isArrowFunction(handler) || ts.isFunctionExpression(handler)) {
			const type = this.checker.getContextualType(handler);
			// With no module resolution, the checker still retains the name of a
			// named import in contextual types, including JSX props and assignments.
			const alias = type?.aliasSymbol;
			if (alias) {
				const declaration = this.checker.resolveName(
					alias.name,
					handler,
					ts.SymbolFlags.Type | ts.SymbolFlags.Alias,
					false,
				)?.declarations?.[0];
				if (
					(declaration &&
						ts.isImportSpecifier(declaration) &&
						this.reactTypeName(declaration.name) === 'SubmitEventHandler') ||
					(declaration &&
						ts.isTypeAliasDeclaration(declaration) &&
						this.hasSubmitType(declaration.type))
				)
					return true;
			}
			if (
				type?.getCallSignatures().some((signature) => {
					const parameter = signature.getDeclaration()?.parameters[0];
					return this.hasSubmitType(parameter?.type, true);
				})
			)
				return true;
		}
		let value: ts.Node = handler;
		let context = value.parent;
		while (
			ts.isParenthesizedExpression(context) ||
			ts.isPropertyAssignment(context) ||
			ts.isObjectLiteralExpression(context) ||
			ts.isArrayLiteralExpression(context)
		) {
			value = context;
			context = value.parent;
		}
		if (
			(ts.isVariableDeclaration(context) && context.initializer === value) ||
			ts.isSatisfiesExpression(context) ||
			ts.isAsExpression(context)
		)
			return this.hasSubmitType(context.type);
		if (
			ts.isBinaryExpression(context) &&
			context.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
			context.right === value &&
			ts.isIdentifier(context.left)
		) {
			const declaration = this.declarationOf(context.left);
			return (
				!!declaration &&
				ts.isVariableDeclaration(declaration) &&
				this.hasSubmitType(declaration.type)
			);
		}
		if (ts.isReturnStatement(context))
			return this.hasSubmitType(ts.findAncestor(context, ts.isFunctionLike)?.type);
		if (ts.isCallExpression(context)) {
			const index = context.arguments.findIndex((argument) => argument === value);
			const signature = this.checker.getResolvedSignature(context)?.getDeclaration();
			return index !== -1 && this.hasSubmitType(signature?.parameters[index]?.type);
		}
		return (
			ts.isArrowFunction(context) && context.body === value && this.hasSubmitType(context.type)
		);
	}

	private checkSubmitParameter(param: ts.ParameterDeclaration) {
		if (!this.isSubmitParameter(param)) return;
		const report = (node: ts.Node) =>
			this.note(
				RULE.eventObject,
				'error',
				node,
				'This React SubmitEvent use needs review. Octane passes a native SubmitEvent with a typed currentTarget.',
			);
		if (!ts.isIdentifier(param.name) || param.dotDotDotToken) {
			report(param);
			return;
		}
		for (const ref of renderUses(this.localUses(param.name))) {
			const access = ref.parent;
			if (
				!ts.isPropertyAccessExpression(access) ||
				access.expression !== ref ||
				ts.findAncestor(access, ts.isFunctionLike) !== param.parent
			) {
				report(ref);
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
			report(access);
		}
	}

	isEventParameter(node: ts.Node) {
		const found = this.parameterOf(node);
		if (!found) return false;
		if (this.source.includes('SubmitEvent') && this.isSubmitParameter(found.param)) return false;
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
		if (
			ctx.template &&
			this.options.elementChild &&
			ts.isIdentifier(tag) &&
			isComponentName(tag.text)
		) {
			const binding =
				declaration && ts.isFunctionDeclaration(declaration)
					? declaration.getStart(this.sf)
					: imported;
			if (
				binding !== null &&
				this.options.elementChild(binding) &&
				opening.attributes.properties.every(
					(a) => ts.isJsxAttribute(a) && a.name.getText(this.sf) !== 'children',
				) &&
				node.closingElement.getText(this.sf) === '</' + tag.text + '>'
			) {
				// Only line breaks and ASCII layout whitespace vanish in rendered JSX.
				const content = node.children.filter(
					(c) => !(ts.isJsxText(c) && /^[\t ]*[\r\n][\t\r\n ]*$/.test(c.text)),
				);
				const [child] = content;
				if (content.length === 1 && (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child))) {
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
		if (ts.isPropertyAccessExpression(tag) && this.isContext(tag.expression)) {
			if (tag.name.text === 'Consumer') return this.rewriteConsumer(node, ctx, tag);
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
		return this.directive(node);
	}

	ifDirective(node: ts.ConditionalExpression) {
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
		if (reads(iterable, (name) => bound.has(name.text))) {
			// Array.filter visits present items and produces a dense array. The
			// property name and the filter's own locals cannot capture a row.
			if (!this.isArrayFilter(iterable)) return null;
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
		let output: ts.Expression;
		if (ts.isBlock(fn.body)) {
			const statements = fn.body.statements;
			const last = statements[statements.length - 1];
			if (!last || !ts.isReturnStatement(last) || !last.expression) return null;
			setup = statements.slice(0, -1);
			if (!this.armReturnsOnlyEmpty(setup)) return null;
			output = last.expression;
		} else output = fn.body;
		const root = skipParens(output);
		if (!isJsx(root) && !ts.isConditionalExpression(root)) return null;

		// Every element the row can render carries the item's key, so it moves
		// to the header once: the same key on each arm of a conditional row.
		const elements = (rowElements(root) ?? []).filter((element) => !ts.isJsxFragment(element));
		const keys = elements.map((element) => {
			return attributeOf(ts.isJsxElement(element) ? element.openingElement : element, 'key');
		});
		let key: ts.Expression | null = null;
		if (keys.some(Boolean)) {
			const values = keys.map((attribute) => {
				const value = attribute?.initializer;
				return value && ts.isJsxExpression(value) ? value.expression : value;
			});
			const text = values[0]?.getText(this.sf);
			if (!values[0] || values.some((value) => value?.getText(this.sf) !== text)) return null;
			key = values[0];
			if (this.readsLocals(key, setup)) {
				this.note(
					RULE.for,
					'warning',
					keys[0] as ts.JsxAttribute,
					'This row key reads a value computed in the row, so the list stays a `.map()`.',
				);
				return null;
			}
		}
		const hoisted = key ? (keys as ts.JsxAttribute[]) : [];
		/** A keyed `<Fragment>` is a bare row. */
		const fragments: ts.JsxElement[] = [];
		for (const attribute of hoisted) {
			this.removed.add(attribute);
			const opening = attribute.parent.parent;
			if (
				ts.isJsxOpeningElement(opening) &&
				opening.attributes.properties.length === 1 &&
				this.calleeName(opening.tagName) === 'Fragment'
			) {
				fragments.push(opening.parent);
				this.bare.add(opening.parent);
			}
		}
		const arm = ts.isConditionalExpression(root)
			? this.ifDirective(root)
			: this.relative(this.emit(root, TEMPLATE), root);
		if (arm === null) {
			for (const attribute of hoisted) this.removed.delete(attribute);
			for (const fragment of fragments) this.bare.delete(fragment);
			return null;
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

	isArrayFilter(iterable: ts.Expression) {
		if (!ts.isCallExpression(iterable) || ts.isOptionalChain(iterable)) return false;
		const method = iterable.expression;
		if (!ts.isPropertyAccessExpression(method) || method.name.text !== 'filter') return false;
		const declarations = this.checker.getSymbolAtLocation(method.name)?.declarations;
		return (
			declarations?.length &&
			declarations.every(
				(declaration) =>
					declaration.getSourceFile() === esLib() &&
					ts.isInterfaceDeclaration(declaration.parent) &&
					['Array', 'ReadonlyArray'].includes(declaration.parent.name.text),
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

	/**
	 * Whether every `return` in a list row's setup leaves the row empty, the
	 * only early exit a directive arm allows.
	 */
	armReturnsOnlyEmpty(statements: ts.Statement[]) {
		let ok = true;
		const visit = (node: ts.Node) => {
			if (isFunctionLike(node)) return;
			if (ts.isReturnStatement(node) && node.expression && !isNullish(node.expression)) ok = false;
			node.forEachChild(visit);
		};
		statements.forEach(visit);
		return ok;
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
		if (returnsJsx(statements.slice(0, first)) || !this.armReturnsOnlyEmpty(rest)) return null;
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
