import ts from 'typescript';
import {
	DEPENDENCY_HOOKS,
	RADIX_TYPES,
	REACT_MODULES,
	TEXT_INPUT_TYPES,
	UNSUPPORTED_VALUES,
	mapPackageExport,
	mapQualifiedType,
	mapReactImport,
	missingExport,
	radixNamespace,
} from './mappings.js';

/**
 * @typedef {'info' | 'warning' | 'error'} Severity
 * @typedef {{ rule: string, severity: Severity, line: number, message: string }} Note
 *
 * @typedef {Object} TransformOptions
 * @property {'tsrx' | 'tsx'} [target] `tsrx` (default) rewrites component
 *   bodies as templates; `tsx` keeps JSX and only ports the React APIs.
 * @property {boolean} [strong] emit Strong-mode source: add `"use strong"` and
 *   leave omitted dependency lists to the compiler.
 * @property {boolean} [strictNullChecks] the project checks with
 *   `strictNullChecks`, so a TypeScript module's own types may prove a child
 *   hole is text
 * @property {{ sourceFile: ts.SourceFile, checker: ts.TypeChecker }} [types]
 *   this module in a program over the whole project, whose resolved imports
 *   type what the module's own program cannot
 * @property {(specifier: string) => string | null} [resolveSpecifier] the new
 *   spelling of an import specifier (a renamed module, a binding package), or
 *   null to keep it.
 * @property {(specifier: string, name: string) => boolean | null} [isContext]
 *   whether an imported name is a context, or null when it cannot be known
 * @property {(specifier: string) => string | null} [unported] the React package
 *   an import specifier names when that package has no Octane port, or null
 * @property {boolean} [reactCompat] the project has React and React DOM 19.2 or
 *   newer in the React 19 series, so `ReactCompat` can host an unported
 *   package's components
 *
 * @typedef {Object} Unported A React package with no Octane port, as this
 *   module uses it
 * @property {string} name
 * @property {number} islands elements now rendered in a `ReactCompat` island
 * @property {number} blocked uses that only a port can support
 *
 * @typedef {Object} TransformResult
 * @property {string} code
 * @property {boolean} changed
 * @property {boolean} template whether the module becomes `.tsrx`: it holds a
 *   template, keeps JSX, or was a JSX module, so no `.tsx` module is left
 *   outside Strong mode's reach
 * @property {Note[]} notes
 * @property {Record<string, number>} rules how often each rule fired
 * @property {ModuleExports} exports what the module exports that other modules'
 *   rewrites depend on
 * @property {Unported[]} unported
 *
 * @typedef {Object} ModuleExports
 * @property {string[]} contexts exported names whose value is a context this
 *   module creates
 * @property {{ specifier: string, names: [string, string][] | null }[]} reexports
 *   `export … from` declarations: [imported, exported] pairs, or null for `*`
 */

/**
 * @typedef {{ template: boolean }} Context
 * @typedef {{ module: string, local: string, imported: string, namespace: boolean, typeOnly: boolean, port: Unported | null }} Import
 */

/** Marks emitted text whose whole line should go. */
const DROP = '\u0000DROP\u0000';
/**
 * Stands in for a newline inside a string or template literal while arms are
 * re-indented, so moving a literal never changes its value.
 */
const LITERAL_NEWLINE = '\u0000NL\u0000';

const TEMPLATE = { template: true };
const PLAIN = { template: false };

/** Rule names, as reported. */
const RULE = {
	binding: 'bindings',
	classComponent: 'class-component',
	consumer: 'context-consumer',
	defaultProps: 'default-props',
	descriptorChildren: 'descriptor-children',
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
 *
 * @param {string} source
 * @param {string} filename
 * @param {TransformOptions} [options]
 * @returns {TransformResult}
 */
export function transformModule(source, filename, options = {}) {
	return new ModuleTransform(source, filename, options).run();
}

/**
 * Parse and bind one module on its own, with only the ES5 library and no
 * module resolution. Binding is enough to map every name to the declaration it
 * refers to, so a shadowed `useState` or event parameter is never mistaken for
 * another; the library gives the module's own types their array and string
 * members.
 *
 * @param {string} filename
 * @param {string} source
 */
function bind(filename, source) {
	const lib = esLib();
	const sf = ts.createSourceFile(
		filename,
		source,
		ts.ScriptTarget.Latest,
		true,
		scriptKind(filename),
	);
	/** @type {ts.CompilerHost} */
	const host = {
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

/** @type {ts.SourceFile | undefined} */
let es5;

/**
 * The ES5 library, parsed once and shared by every module's program, so
 * array and string members have types.
 */
function esLib() {
	const file = ts.getDefaultLibFilePath({}).replace(/[^/\\]+$/, 'lib.es5.d.ts');
	es5 ??= ts.createSourceFile(
		'lib.es5.d.ts',
		/** @type {string} */ (ts.sys.readFile(file)),
		ts.ScriptTarget.Latest,
		true,
	);
	return es5;
}

/** @param {string} filename */
function scriptKind(filename) {
	if (filename.endsWith('.tsx')) return ts.ScriptKind.TSX;
	if (filename.endsWith('.jsx')) return ts.ScriptKind.JSX;
	if (/\.[cm]?ts$/.test(filename)) return ts.ScriptKind.TS;
	// Plain .js files often hold JSX in React projects.
	return ts.ScriptKind.JSX;
}

/**
 * @param {ts.Expression} node
 * @returns {ts.Expression}
 */
function skipParens(node) {
	while (ts.isParenthesizedExpression(node)) node = node.expression;
	return node;
}

/** @param {ts.Node} node */
function isJsx(node) {
	return ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node);
}

/**
 * What a module's import of a package with no Octane port leaves to do.
 *
 * @param {Unported} port
 */
function portComment({ name, islands, blocked }) {
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
 *
 * @param {ts.Expression} node
 */
function isTextSpelling(node) {
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
 *
 * @param {ts.Expression} node
 * @returns {boolean}
 */
function isStringSpelling(node) {
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
 *
 * @param {ts.Type} type
 * @returns {0 | 1 | 2}
 */
function textKind(type) {
	const { TypeFlags } = ts;
	const opaque =
		TypeFlags.Any | TypeFlags.Unknown | TypeFlags.Never | TypeFlags.VoidLike | TypeFlags.Null;
	if (type.flags & opaque) return 0;
	if (type.flags & TypeFlags.StringLike) return 1;
	if (type.flags & (TypeFlags.NumberLike | TypeFlags.BigIntLike)) return 2;
	if (!type.isUnion()) return 0;
	/** @type {0 | 1 | 2} */
	let kind = 1;
	for (const member of type.types) {
		const each = textKind(member);
		if (each === 0) return 0;
		if (each === 2) kind = 2;
	}
	return kind;
}

/**
 * The outermost node of `sf` spanning exactly `[start, end)`.
 *
 * @param {ts.SourceFile} sf
 * @param {number} start
 * @param {number} end
 * @returns {ts.Node | null}
 */
function nodeSpanning(sf, start, end) {
	/** @type {ts.Node} */
	let node = sf;
	for (;;) {
		const child = ts.forEachChild(node, (c) => (c.pos <= start && c.end >= end ? c : undefined));
		if (!child) return null;
		if (child.getStart(sf) === start && child.end === end) return child;
		node = child;
	}
}

/**
 * The attribute an element sets by `name`.
 *
 * @param {ts.JsxOpeningLikeElement} element
 * @param {string} name
 */
function attributeOf(element, name) {
	return /** @type {ts.JsxAttribute | undefined} */ (
		element.attributes.properties.find(
			(a) => ts.isJsxAttribute(a) && ts.isIdentifier(a.name) && a.name.text === name,
		)
	);
}

/**
 * The elements a list row can render: the row itself, or each arm of a
 * conditional row. Null when an arm renders anything else.
 *
 * @param {ts.Expression} node
 * @returns {(ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment)[] | null}
 */
function rowElements(node) {
	node = skipParens(node);
	if (isJsx(node))
		return [/** @type {ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment} */ (node)];
	if (isNullish(node)) return [];
	if (!ts.isConditionalExpression(node)) return null;
	const whenTrue = rowElements(node.whenTrue);
	const whenFalse = rowElements(node.whenFalse);
	return whenTrue && whenFalse && [...whenTrue, ...whenFalse];
}

/**
 * The element an `if (c) return <A />;` guard returns, or null for any other
 * statement.
 *
 * @param {ts.Statement} statement
 * @returns {ts.Expression | null}
 */
function guardReturn(statement) {
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
 *
 * @param {readonly ts.Statement[]} statements
 */
function returnsJsx(statements) {
	/** @type {(node: ts.Node) => boolean} */
	const hasJsx = (node) => isJsx(node) || (ts.forEachChild(node, hasJsx) ?? false);
	/** @type {(node: ts.Node) => boolean} */
	const visit = (node) => {
		if (isFunctionLike(node)) return false;
		if (ts.isReturnStatement(node) && node.expression && hasJsx(node.expression)) return true;
		return ts.forEachChild(node, visit) ?? false;
	};
	return statements.some(visit);
}

/** Document tags a router shell renders through `@octanejs/tanstack-router`. */
const DOCUMENT_TAGS = /** @type {Record<string, string>} */ ({
	html: 'Html',
	head: 'Head',
	body: 'Body',
});

/**
 * Whether an identifier is read in a type, where an import needs no value.
 * A `typeof X` query is a type, which `import type` serves; `extends Base`
 * reads a value, so heritage counts as one.
 *
 * @param {ts.Identifier} node
 */
function inTypeNode(node) {
	let parent = node.parent;
	while (ts.isQualifiedName(parent)) parent = parent.parent;
	return ts.isTypeNode(parent) && !ts.isExpressionWithTypeArguments(parent);
}

/** @param {ts.Node} node */
function isNullish(node) {
	return (
		node.kind === ts.SyntaxKind.NullKeyword ||
		node.kind === ts.SyntaxKind.FalseKeyword ||
		(ts.isIdentifier(node) && node.text === 'undefined')
	);
}

/** @param {ts.Node} node */
function isFunctionLike(node) {
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
 * Whether evaluating `node` can only produce a boolean, so `node && <X />`
 * renders nothing when it is falsy, exactly as `@if` does. React renders `0`
 * and `NaN` from a numeric left side, so anything unproven stays a hole.
 * `valueOf` gives the initializer a `const` name is bound to, if any.
 *
 * @param {ts.Expression} node
 * @param {(name: ts.Identifier) => ts.Expression | null} valueOf
 * @returns {boolean}
 */
function isBoolean(node, valueOf) {
	node = skipParens(node);
	if (ts.isIdentifier(node)) {
		const value = valueOf(node);
		return value !== null && isBoolean(value, valueOf);
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
				return isBoolean(node.left, valueOf) && isBoolean(node.right, valueOf);
		}
		return false;
	}
	if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
		return node.expression.text === 'Boolean';
	}
	return false;
}

/**
 * Modules whose exports the codemod knows by name: React's, and Octane's own
 * for code already partly migrated.
 *
 * @param {string} module
 */
function isApiModule(module) {
	return module in REACT_MODULES || module === 'octane';
}

/**
 * Whether an identifier names a property rather than a binding.
 *
 * @param {ts.Identifier} node
 */
function isPropertyName(node) {
	const parent = /** @type {ts.Node & { name?: ts.Node }} */ (node.parent);
	if (ts.isPropertyAccessExpression(parent)) return parent.name === node;
	if (ts.isQualifiedName(parent)) return parent.right === node;
	return (
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
 *
 * @param {ts.Identifier} node
 */
function declaresName(node) {
	const parent = /** @type {ts.Node & { name?: ts.Node }} */ (node.parent);
	if (parent.name !== node) return false;
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
 *
 * @param {ts.BindingName} name
 * @returns {string[]}
 */
function bindingNames(name) {
	if (ts.isIdentifier(name)) return [name.text];
	return name.elements.flatMap((element) =>
		ts.isOmittedExpression(element) ? [] : bindingNames(element.name),
	);
}

/**
 * Whether `node` reads a name `test` accepts.
 *
 * @param {ts.Node} node
 * @param {(name: string) => boolean} test
 * @returns {boolean}
 */
function reads(node, test) {
	if (ts.isIdentifier(node)) return test(node.text);
	return ts.forEachChild(node, (child) => reads(child, test) || undefined) === true;
}

/**
 * Whether a `function` body reads its own `this` or `arguments`.
 *
 * @param {ts.Node} node
 * @returns {boolean}
 */
function usesOwnThis(node) {
	if (node.kind === ts.SyntaxKind.ThisKeyword) return true;
	if (ts.isIdentifier(node) && node.text === 'arguments') return true;
	if (isFunctionLike(node) && !ts.isArrowFunction(node)) return false;
	return ts.forEachChild(node, (child) => usesOwnThis(child) || undefined) === true;
}

/**
 * The children of an element that are more than layout whitespace.
 *
 * @param {ts.JsxElement | ts.JsxFragment} node
 */
function contentOf(node) {
	return node.children.filter(
		(child) => !(ts.isJsxText(child) && child.containsOnlyTriviaWhiteSpaces),
	);
}

/**
 * A comment's text without its delimiters, to wrap as a JSX comment.
 *
 * @param {string} comment
 */
function commentText(comment) {
	const body = comment.startsWith('//') ? comment.slice(2) : comment.slice(2, -2);
	return body.trim().replaceAll('*/', '* /');
}

/** @param {string} name */
function isComponentName(name) {
	return /^[A-Z]/.test(name);
}

class ModuleTransform {
	/**
	 * @param {string} source
	 * @param {string} filename
	 * @param {TransformOptions} options
	 */
	constructor(source, filename, options) {
		this.source = source;
		this.filename = filename;
		this.options = options;
		this.target = options.target ?? 'tsrx';
		this.strong = options.strong === true;
		/** @type {Set<string>} React imports read as values, not only as types. */
		this.valueUses = new Set();
		this.routerShell = false;
		this.textTypes = options.strictNullChecks === true && /\.[cm]?tsx?$/.test(filename);
		const { sf, checker } = bind(filename, source);
		this.sf = sf;
		this.checker = checker;
		/** @type {Note[]} */
		this.notes = [];
		/** @type {Record<string, number>} */
		this.rules = {};
		this.template = false;
		this.indentUnit = /^\t/m.test(source) ? '\t' : '  ';

		/** @type {Map<ts.Node, Import>} Every import, keyed by its declaration. */
		this.imports = new Map();
		/** @type {Map<string, Import>} React and Octane imports, by local name. */
		this.apiLocals = new Map();
		/** React-module locals that are still referenced after the rewrite. */
		this.used = new Set();
		/** Imports the rewrite needs from Octane: module -> name -> { local, typeOnly } */
		this.added = new Map();
		/** Every name the module declares, to keep added imports from colliding. */
		this.declared = new Set();
		/** Attributes a parent rule has already consumed, such as a row key. */
		this.removed = new Set();
		/** `<Fragment key>` rows whose key moved to the `@for` header. */
		this.bare = new Set();
		/** Functions whose parameter list a rule replaced. */
		this.parameters = new Map();
		/** @type {Set<ts.BindingElement>} Rest props that give up `onChange` to a text field. */
		this.restChange = new Set();
		/** @type {Set<ts.JsxSpreadAttribute>} Spreads of those rest props, which pass it as `onInput`. */
		this.changeSpreads = new Set();
		/** @type {Set<ts.VariableDeclaration | ts.FunctionDeclaration>} Components to mark `descriptorChildren`. */
		this.descriptorComponents = new Set();
		/** Whether a `declare module` now augments `octane/jsx-runtime`. */
		this.augments = false;
		/** @type {Map<string, Unported | null>} Each import specifier's unported package. */
		this.ports = new Map();
		/** @type {Map<string, Unported>} Unported packages, by name. */
		this.unported = new Map();
		/** @type {Set<ts.JsxElement | ts.JsxSelfClosingElement>} Elements to host in a `ReactCompat` island. */
		this.islands = new Set();
		/** @type {ts.ImportDeclaration[]} Placeholder index -> import declaration. */
		this.importSlots = [];
		this.hasJsx = false;
		/** Whether the module imports React, rather than already being Octane. */
		this.fromReact = false;
		/** @type {Map<string, string | null>} Each specifier's new spelling, or null to keep it. */
		this.resolved = new Map();
	}

	/** @returns {TransformResult} */
	run() {
		this.analyze();
		let code = this.emit(this.sf, PLAIN, 0);
		code = this.finishImports(code);
		code = code.replace(/^[ \t]*\u0000DROP\u0000[ \t]*\r?\n/gm, '').replaceAll(DROP, '');
		code = code.replaceAll(LITERAL_NEWLINE, '\n');
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

	/** @returns {ModuleExports} */
	exportsOf() {
		/** @type {Set<string>} */
		const contexts = new Set();
		/** @type {Set<string>} */
		const exported = new Set();
		/** @type {ModuleExports['reexports']} */
		const reexports = [];
		const isExported = (/** @type {ts.Statement} */ statement) =>
			ts.canHaveModifiers(statement) &&
			ts.getModifiers(statement)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
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
				const pairs = statement.exportClause.elements.map(
					(element) =>
						/** @type {[string, string]} */ ([
							(element.propertyName ?? element.name).text,
							element.name.text,
						]),
				);
				if (statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
					reexports.push({ specifier: statement.moduleSpecifier.text, names: pairs });
				} else {
					for (const [local, name] of pairs) if (contexts.has(local)) exported.add(name);
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
		return { contexts: [...exported], reexports };
	}

	// ---------------------------------------------------------------- analysis

	analyze() {
		// Added imports quote their module as the module's own imports do.
		const first = this.sf.statements.find(ts.isImportDeclaration);
		this.quote = first ? first.moduleSpecifier.getText(this.sf)[0] : "'";
		/** Locals imported from a package with no Octane port. */
		const portLocals = new Set();
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
			const module = /** @type {ts.StringLiteral} */ (statement.moduleSpecifier).text;
			if (module in REACT_MODULES) this.fromReact = true;
			if (/^@tanstack\/react-(?:router|start)(?:\/|$)/.test(module)) this.routerShell = true;
			const clause = statement.importClause;
			const record = (
				/** @type {ts.Node} */ declaration,
				/** @type {ts.Identifier} */ name,
				/** @type {string} */ imported,
				/** @type {boolean} */ typeOnly,
			) => {
				const port = typeOnly ? null : this.portOf(module);
				const entry = {
					module,
					local: name.text,
					imported,
					namespace: imported === '*',
					typeOnly,
					port,
				};
				this.imports.set(declaration, entry);
				if (port) portLocals.add(name.text);
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
		/** @type {ts.JsxOpeningLikeElement[]} */
		const fields = [];
		/** @type {ts.Expression[]} Values read as an element: cloned, inspected, or a `render` prop. */
		const elements = [];
		const visit = (/** @type {ts.Node} */ node) => {
			if (ts.isIdentifier(node) && declaresName(node)) this.declared.add(node.text);
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
		for (const field of fields) if (this.takesChange(field)) this.planRestChange(field);
		for (const element of elements) this.planDescriptorChildren(element);
	}

	/**
	 * The package with no Octane port that a specifier names, or null. It
	 * still runs on React, which only the codemod's report and a comment say.
	 *
	 * @param {string} module
	 */
	portOf(module) {
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
	 *
	 * @param {ts.Identifier} node
	 */
	planUnported(node) {
		const port = this.inImport(node) ? null : this.importOf(node)?.port;
		if (!port) return;
		// `Toast.Bar`, through a namespace or default import, is the member.
		const member =
			ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node
				? node.parent
				: node;
		const name = ts.isPropertyAccessExpression(member) ? member.name.text : node.text;
		const text = member.getText(this.sf);
		const parent = member.parent;
		const block = (/** @type {string} */ message) => {
			port.blocked++;
			this.note(RULE.bindings, 'error', member, `${message} \`${port.name}\` has no Octane port.`);
		};
		if (
			(ts.isJsxOpeningElement(parent) || ts.isJsxSelfClosingElement(parent)) &&
			parent.tagName === member
		) {
			const element = ts.isJsxOpeningElement(parent) ? parent.parent : parent;
			if (this.inIsland(element)) return;
			if (!this.hostsInReact(element)) {
				block(
					`\`<${text}>\` takes children or props that Octane renders, which cannot cross into a React island.`,
				);
			} else if (!this.options.reactCompat) {
				block(
					`\`<${text}>\` can render in a \`ReactCompat\` island only with React and React DOM 19.2 or newer in the React 19 series.`,
				);
			} else {
				port.islands++;
				this.islands.add(element);
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

	/**
	 * Whether a React component's element can be the root of a `ReactCompat`
	 * island: React renders all of it, so its children are text and no prop
	 * holds an element, as JSX here, through a value this module declares, or
	 * by its type.
	 *
	 * @param {ts.JsxElement | ts.JsxSelfClosingElement} element
	 */
	hostsInReact(element) {
		// By type: a cast to `any` or `ReactNode` proves nothing.
		const text = (/** @type {ts.JsxChild} */ child) =>
			ts.isJsxText(child) ||
			(ts.isJsxExpression(child) &&
				(!child.expression || textKind(this.typeOf(child.expression)) !== 0));
		if (ts.isJsxElement(element) && !element.children.every(text)) return false;
		const seen = new Set();
		/** @type {(node: ts.Node) => boolean} */
		const rendersOctane = (node) => {
			if (isJsx(node)) return true;
			if (ts.isIdentifier(node)) {
				const project = this.projectType(node);
				const type = (project?.checker ?? this.checker).typeToString(
					project?.type ?? this.checker.getTypeAtLocation(node),
					undefined,
					ts.TypeFormatFlags.NoTruncation,
				);
				if (/\b(?:React(?:Node|Element)|JSX\.Element)\b/.test(type)) return true;
				const declaration = this.declarationOf(node);
				if (declaration?.getSourceFile() === this.sf && !seen.has(declaration)) {
					seen.add(declaration);
					if (rendersOctane(declaration)) return true;
				}
			}
			return ts.forEachChild(node, rendersOctane) ?? false;
		};
		return !rendersOctane(
			ts.isJsxElement(element) ? element.openingElement.attributes : element.attributes,
		);
	}

	/**
	 * Whether an element is already the child of a `ReactCompat` island.
	 *
	 * @param {ts.JsxElement | ts.JsxSelfClosingElement} element
	 */
	inIsland(element) {
		const parent = element.parent;
		if (!ts.isJsxElement(parent)) return false;
		const entry = this.importOf(parent.openingElement.tagName);
		return entry?.module === 'octane/react' && entry.imported === 'ReactCompat';
	}

	/**
	 * Whether a callee reads its argument as an element: `cloneElement`,
	 * `isValidElement`, or a `Children` method.
	 *
	 * @param {ts.Expression} callee
	 */
	readsElement(callee) {
		const name = this.calleeName(callee);
		if (name === 'cloneElement' || name === 'isValidElement') return true;
		return (
			ts.isPropertyAccessExpression(callee) && this.calleeName(callee.expression) === 'Children'
		);
	}

	/**
	 * React passes a component its JSX children as elements, which
	 * `render={children}` and `cloneElement(children)` rely on. Octane passes a
	 * compiled render body unless the component is marked `descriptorChildren`,
	 * so mark the component whose own `children` this reads.
	 *
	 * @param {ts.Expression} expression
	 */
	planDescriptorChildren(expression) {
		let value = expression;
		while (
			ts.isParenthesizedExpression(value) ||
			ts.isAsExpression(value) ||
			ts.isSatisfiesExpression(value) ||
			ts.isNonNullExpression(value) ||
			ts.isTypeAssertionExpression(value)
		) {
			value = value.expression;
		}
		const component = this.childrenOwner(value);
		if (!component) return;
		// `memo(…)` and `forwardRef(…)` wrap it; the declaration holds the call.
		let holder = component.parent;
		while (
			ts.isCallExpression(holder) &&
			/^(?:memo|forwardRef)$/.test(this.calleeName(holder.expression) ?? '')
		) {
			holder = holder.parent;
		}
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
	 *
	 * @param {ts.Expression} node
	 * @returns {ts.SignatureDeclaration | null}
	 */
	childrenOwner(node) {
		/** @type {ts.Node | null} */
		let props = null;
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
		const component = /** @type {ts.SignatureDeclaration} */ (props.parent);
		return component.parameters[0] === props && isFunctionLike(component) ? component : null;
	}

	/**
	 * Whether no code that runs while the module loads can reach `fn` before
	 * its declaration, so it can become a `const`, which is not hoisted. Any
	 * function there may run (an IIFE, a callback, a method an imported call
	 * invokes) except one it only defines: a declaration or a variable's value.
	 * Those run only when called or passed on, which counts as reaching `fn`
	 * for any binding the module declares.
	 *
	 * @param {ts.FunctionDeclaration} fn
	 */
	declaredBeforeUse(fn) {
		let safe = true;
		const visit = (/** @type {ts.Node} */ node) => {
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
	 *
	 * @param {ts.Node} fn
	 */
	onlyDefines(fn) {
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
	 *
	 * @param {ts.JsxOpeningLikeElement} element
	 */
	takesChange(element) {
		if (!/^(?:input|textarea)$/.test(element.tagName.getText(this.sf))) return false;
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
	 *
	 * @param {ts.JsxOpeningLikeElement} field
	 */
	planRestChange(field) {
		for (const spread of field.attributes.properties) {
			if (!ts.isJsxSpreadAttribute(spread)) continue;
			// Props whose type has no `onChange` have none to pass on.
			const type = this.projectType(spread.expression)?.type;
			if (type && !(type.flags & ts.TypeFlags.Any) && !type.getProperty('onChange')) continue;
			const declaration = ts.isIdentifier(spread.expression)
				? this.declarationOf(spread.expression)
				: null;
			const rest =
				declaration &&
				ts.isBindingElement(declaration) &&
				declaration.dotDotDotToken &&
				ts.isObjectBindingPattern(declaration.parent)
					? declaration
					: null;
			// A pattern that names `onChange` leaves none in the rest.
			const pattern = /** @type {ts.ObjectBindingPattern | undefined} */ (rest?.parent);
			if (
				pattern?.elements.some((e) => (e.propertyName ?? e.name).getText(this.sf) === 'onChange')
			) {
				continue;
			}
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
	 *
	 * @param {ts.BindingElement} rest
	 */
	onlySpreadOntoFields(rest) {
		let only = true;
		const visit = (/** @type {ts.Node} */ node) => {
			if (!only) return;
			if (ts.isIdentifier(node) && node !== rest.name && this.declarationOf(node) === rest) {
				const parent = node.parent;
				only = ts.isJsxSpreadAttribute(parent)
					? this.takesChange(parent.parent.parent)
					: ts.isPropertyAccessExpression(parent) &&
						parent.expression === node &&
						parent.name.text !== 'onChange';
			}
			ts.forEachChild(node, visit);
		};
		visit(ts.findAncestor(rest, ts.isFunctionLike) ?? this.sf);
		return only;
	}

	/**
	 * The declaration a name refers to.
	 *
	 * @param {ts.Identifier} node
	 * @returns {ts.Declaration | null}
	 */
	declarationOf(node) {
		const parent = node.parent;
		const symbol =
			ts.isShorthandPropertyAssignment(parent) && parent.name === node
				? this.checker.getShorthandAssignmentValueSymbol(parent)
				: this.checker.getSymbolAtLocation(node);
		return symbol?.declarations?.[0] ?? null;
	}

	/**
	 * The initializer of the `const` a name refers to, or null.
	 *
	 * @param {ts.Identifier} node
	 * @returns {ts.Expression | null}
	 */
	constValue(node) {
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
	 *
	 * @param {ts.Node} node
	 * @returns {Import | null}
	 */
	importOf(node) {
		if (!ts.isIdentifier(node)) return null;
		const declaration = this.declarationOf(node);
		return declaration ? (this.imports.get(declaration) ?? null) : null;
	}

	/**
	 * The React or Octane export a callee names, through a named import or a
	 * namespace.
	 *
	 * @param {ts.Node} node
	 * @returns {string | null}
	 */
	calleeName(node) {
		return this.callee(node)?.name ?? null;
	}

	/**
	 * @param {ts.Node} node
	 * @returns {{ name: string, module: string } | null}
	 */
	callee(node) {
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

	/** @param {ts.Node} node */
	line(node) {
		return this.sf.getLineAndCharacterOfPosition(node.getStart(this.sf)).line + 1;
	}

	/**
	 * @param {string} rule
	 * @param {Severity} severity
	 * @param {ts.Node} node
	 * @param {string} message
	 */
	note(rule, severity, node, message) {
		this.notes.push({ rule, severity, line: this.line(node), message });
	}

	/** @param {string} rule */
	count(rule) {
		this.rules[rule] = (this.rules[rule] ?? 0) + 1;
	}

	/**
	 * Request an import from Octane and return the local name to use.
	 *
	 * @param {string} module
	 * @param {string} name
	 * @param {boolean} typeOnly
	 */
	require(module, name, typeOnly) {
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
		const local = collides ? `Octane${name[0].toUpperCase()}${name.slice(1)}` : name;
		names.set(name, { local, typeOnly });
		return local;
	}

	/**
	 * Whether this module declares `symbol`, rather than the library or
	 * nothing at all.
	 *
	 * @param {ts.Symbol | undefined} symbol
	 */
	declaresHere(symbol) {
		return symbol?.declarations?.some((d) => d.getSourceFile() === this.sf) ?? false;
	}

	/**
	 * Whether the module reads `name` as a global, such as the DOM's
	 * `MouseEvent`, which an import of the same name would shadow.
	 *
	 * @param {string} name
	 */
	readsGlobal(name) {
		/** @type {(node: ts.Node) => boolean} */
		const visit = (node) => {
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
	 *
	 * @param {ts.Node} node
	 * @param {Context} ctx
	 * @param {number} [start]
	 * @returns {string}
	 */
	emit(node, ctx, start) {
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

	/** @param {ts.Node} node */
	inImport(node) {
		for (let current = node.parent; current; current = current.parent) {
			if (ts.isImportDeclaration(current)) return true;
		}
		return false;
	}

	/**
	 * The text of `node` between `from` and `to`, with every child inside that
	 * range emitted.
	 *
	 * @param {ts.Node} node
	 * @param {number} from
	 * @param {number} to
	 * @param {Context} ctx
	 */
	span(node, from, to, ctx) {
		let out = '';
		let cursor = from;
		const childCtx = ts.isJsxElement(node) || ts.isJsxFragment(node) ? ctx : PLAIN;
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
			out += this.emit(child, jsxChild ? childCtx : PLAIN);
			cursor = child.end;
		});
		return out + this.source.slice(cursor, to);
	}

	/**
	 * @param {ts.Node} node
	 * @param {Context} ctx
	 * @returns {string | null}
	 */
	rewrite(node, ctx) {
		if (ts.isImportDeclaration(node)) return this.rewriteImport(node);
		if (ts.isExportDeclaration(node) && node.moduleSpecifier) return this.rewriteReexport(node);
		if (ts.isCallExpression(node)) return this.rewriteCall(node);
		if (ts.isPropertyAccessExpression(node)) return this.rewriteMember(node);
		if (ts.isQualifiedName(node)) return this.rewriteQualifiedType(node);
		if (ts.isImportTypeNode(node)) return this.rewriteImportType(node);
		if (ts.isTypeReferenceNode(node)) return this.rewriteTypeReference(node);
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
		if (ts.isJsxAttributes(node)) return this.rewriteAttributes(node);
		if ((ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) && this.islands.has(node)) {
			this.count(RULE.reactCompat);
			const island = this.require('octane/react', 'ReactCompat', false);
			return `<${island}>${this.span(node, node.getStart(this.sf), node.end, PLAIN)}</${island}>`;
		}
		if (ts.isJsxElement(node)) return this.rewriteElement(node, ctx);
		if (ts.isJsxExpression(node) && ctx.template) return this.rewriteHole(node);
		if (
			ts.isFunctionDeclaration(node) ||
			ts.isFunctionExpression(node) ||
			ts.isArrowFunction(node)
		) {
			const component = this.target === 'tsrx' ? this.rewriteComponent(node) : null;
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

	/** @param {ts.ImportDeclaration} node */
	rewriteImport(node) {
		const module = /** @type {ts.StringLiteral} */ (node.moduleSpecifier).text;
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
	 *
	 * @param {ts.ImportDeclaration | ts.ExportDeclaration} node
	 * @param {string} module
	 */
	rewritePackageNames(node, module) {
		const clause = ts.isImportDeclaration(node) ? node.importClause : node;
		const namespace = radixNamespace(module);
		const next = this.resolve(module);
		// A default import; and a Radix package's re-export, which rewriteSpecifier reports.
		if (!clause || next === null || (ts.isImportClause(clause) ? clause.name : namespace)) {
			return null;
		}
		const keyword = ts.isImportClause(clause) ? 'import' : 'export';
		const quote =
			this.source[/** @type {ts.Expression} */ (node.moduleSpecifier).getStart(this.sf)];
		const from = (/** @type {string} */ specifier) => `from ${quote}${specifier}${quote};`;
		const type = clause.isTypeOnly ? 'type ' : '';
		const bindings = ts.isImportClause(clause) ? clause.namedBindings : clause.exportClause;
		if (bindings && ts.isNamespaceImport(bindings)) {
			if (namespace === null) return null;
			const local = bindings.name.text;
			this.count(RULE.import);
			return `import ${type}{ ${local === namespace ? local : `${namespace} as ${local}`} } ${from(next)}`;
		}
		if (!bindings || ts.isNamespaceExport(bindings)) return null;
		/** @type {string[]} */
		const kept = [];
		/** @type {string[]} */
		const values = [];
		/** @type {string[]} */
		const types = [];
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
	 * @param {ts.Node} namespace
	 * @param {ts.MemberName} member
	 * @param {Severity} severity of a member the port lacks
	 */
	rewritePackageMember(namespace, member, severity) {
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

	/** @param {ts.ExportDeclaration} node */
	rewriteReexport(node) {
		const module = /** @type {ts.StringLiteral} */ (node.moduleSpecifier).text;
		const mapped = REACT_MODULES[module];
		if (mapped) {
			this.count(RULE.import);
			return this.replaceSpecifier(
				node,
				/** @type {ts.Expression} */ (node.moduleSpecifier),
				mapped,
			);
		}
		return (
			this.rewritePackageNames(node, module) ??
			this.rewriteSpecifier(node, /** @type {ts.Expression} */ (node.moduleSpecifier))
		);
	}

	/**
	 * @param {ts.Node} node
	 * @param {ts.Expression} specifier
	 */
	rewriteSpecifier(node, specifier) {
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
	 *
	 * @param {string} specifier
	 */
	resolve(specifier) {
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
	 *
	 * @param {ts.ModuleDeclaration} node
	 * @param {ts.StringLiteral} specifier
	 */
	rewriteAugmentation(node, specifier) {
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

	/**
	 * @param {ts.Node} node
	 * @param {ts.Expression} specifier
	 * @param {string} next
	 */
	replaceSpecifier(node, specifier, next) {
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
	 *
	 * @param {ts.ImportTypeNode} node
	 */
	rewriteImportType(node) {
		const argument = node.argument;
		if (!ts.isLiteralTypeNode(argument) || !ts.isStringLiteral(argument.literal)) return null;
		const specifier = argument.literal;
		const module = REACT_MODULES[specifier.text];
		if (module === undefined) return this.rewriteSpecifier(node, specifier);
		this.count(RULE.import);
		const qualifier = node.qualifier;
		const name = qualifier && ts.isIdentifier(qualifier) ? qualifier.text : null;
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
			return head + this.span(node, specifier.end, node.end, PLAIN);
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
	 *
	 * @param {string} code
	 */
	finishImports(code) {
		/** @type {Map<string, Map<string, { name: string, local: string, typeOnly: boolean }>>} */
		const imports = new Map();
		const add = (
			/** @type {string} */ module,
			/** @type {string} */ name,
			/** @type {string} */ local,
			/** @type {boolean} */ typeOnly,
		) => {
			let names = imports.get(module);
			if (!names) imports.set(module, (names = new Map()));
			const existing = names.get(`${name} ${local}`);
			if (existing) existing.typeOnly &&= typeOnly;
			else names.set(`${name} ${local}`, { name, local, typeOnly });
		};
		/** React specifiers with no Octane export stay on React, for a person. */
		const kept = new Map();
		for (const node of this.importSlots) {
			const module = /** @type {ts.StringLiteral} */ (node.moduleSpecifier).text;
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

		/** @type {string[]} */
		const lines = [];
		const quote = (/** @type {string} */ module) => this.quote + module + this.quote;
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
		return code.replace(/\u0000IMPORT(\d+)\u0000(\r?\n)?/g, (_, index, newline) =>
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
	 *
	 * @param {string} code
	 */
	insertionPoint(code) {
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

	/** @param {string} code */
	addStrongDirective(code) {
		this.count(RULE.strong);
		const at = this.insertionPoint(code);
		return code.slice(0, at) + '"use strong";\n' + (at === 0 ? '\n' : '') + code.slice(at);
	}

	/** @param {string} code */
	addJsxPragma(code) {
		if (/@jsxImportSource\s+octane/.test(code)) return code;
		const replaced = code.replace(/@jsxImportSource\s+\S+/, '@jsxImportSource octane');
		return replaced !== code ? replaced : '/** @jsxImportSource octane */\n' + code;
	}

	// ---------------------------------------------------------------- APIs

	/** @param {ts.PropertyAccessExpression} node */
	rewriteMember(node) {
		// `<Ctx.Provider value>` is `<Ctx value>` in Octane, as in React 19.
		const tag = node.parent;
		const isTag =
			(ts.isJsxOpeningElement(tag) ||
				ts.isJsxClosingElement(tag) ||
				ts.isJsxSelfClosingElement(tag)) &&
			tag.tagName === node;
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
	 *
	 * @param {ts.EntityName} node
	 * @param {string} name
	 */
	isGlobalNamespace(node, name) {
		return (
			ts.isIdentifier(node) &&
			node.text === name &&
			!this.checker.resolveName(name, node, ts.SymbolFlags.Namespace, false)
		);
	}

	/** @param {ts.QualifiedName} node */
	rewriteQualifiedType(node) {
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

	/** @param {ts.TypeReferenceNode} node */
	rewriteTypeReference(node) {
		// The global `JSX` namespace React's types declared is Octane's export.
		const name = node.typeName;
		if (ts.isQualifiedName(name) && this.isGlobalNamespace(name.left, 'JSX')) {
			this.require('octane', 'JSX', true);
		}
		return null;
	}

	/** @param {ts.CallExpression} node */
	rewriteCall(node) {
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

	/**
	 * React runs an effect or memo without a dependency list on every render.
	 * Octane infers the list instead, so compatibility output passes `null` to
	 * keep React's behavior. Strong output leaves it to the compiler, which is
	 * what Strong asks for.
	 *
	 * @param {ts.CallExpression} node
	 * @param {string} name
	 */
	rewriteDependencies(node, name) {
		if (node.arguments.length !== DEPENDENCY_HOOKS[name]) return null;
		if (this.strong) {
			this.note(
				RULE.deps,
				'info',
				node,
				`\`${name}\` had no dependency list, so React ran it on every render; Strong infers its dependencies.`,
			);
			return null;
		}
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
	 *
	 * @param {ts.CallExpression} node
	 */
	rewriteForwardRef(node) {
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
		let pattern;
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
		let parameters;
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
	 *
	 * @param {ts.SignatureDeclaration & { body?: ts.Node }} node
	 * @param {number} end
	 */
	head(node, end) {
		const parameters = this.parameters.get(node);
		if (parameters === undefined) return this.span(node, node.getStart(this.sf), end, PLAIN);
		return (
			this.span(node, node.getStart(this.sf), node.parameters.pos, PLAIN) +
			parameters +
			this.span(node, node.parameters.end, end, PLAIN)
		);
	}

	/** @param {ts.ParameterDeclaration | undefined} ref */
	refTypeOf(ref) {
		const type = ref?.type;
		if (type && ts.isTypeReferenceNode(type) && type.typeArguments?.length === 1) {
			return this.emit(type.typeArguments[0], PLAIN);
		}
		return null;
	}

	isTypeScript() {
		return /\.[cm]?tsx?$/.test(this.filename);
	}

	/**
	 * @param {ts.CallExpression} node
	 * @param {'render' | 'hydrate'} name
	 */
	rewriteLegacyRoot(node, name) {
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
	 *
	 * @param {ts.Expression} node
	 */
	isRoot(node) {
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
	 * @param {ts.CallExpression} node
	 * @param {ts.Expression} argument the element, the call's last argument
	 */
	rewriteRootRender(node, argument) {
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
	 *
	 * @param {ts.Expression} expression
	 * @returns {string | null}
	 */
	rootComponent(expression) {
		let node = skipParens(expression);
		if (ts.isJsxElement(node) && this.calleeName(node.openingElement.tagName) === 'StrictMode') {
			const children = node.children.filter(
				(child) => !(ts.isJsxText(child) && child.containsOnlyTriviaWhiteSpaces),
			);
			if (children.length !== 1 || !isJsx(children[0])) return null;
			node = /** @type {ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment} */ (children[0]);
		}
		if (ts.isJsxSelfClosingElement(node)) {
			const tag = node.tagName;
			if (!ts.isIdentifier(tag) && !ts.isPropertyAccessExpression(tag)) return null;
			if (!isComponentName(tag.getText(this.sf).split('.').pop() ?? '')) return null;
			/** @type {string[]} */
			const props = [];
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

	/** @param {ts.ExpressionStatement} node */
	rewriteStatement(node) {
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
	 *
	 * @param {ts.Node} node
	 * @returns {{ fn: ts.SignatureDeclaration, param: ts.ParameterDeclaration } | null}
	 */
	parameterOf(node) {
		if (!ts.isIdentifier(node)) return null;
		const param = this.declarationOf(node);
		if (!param || !ts.isParameter(param)) return null;
		return { fn: /** @type {ts.SignatureDeclaration} */ (param.parent), param };
	}

	/** @param {ts.Node} node */
	isEventParameter(node) {
		const found = this.parameterOf(node);
		if (!found) return false;
		const type = found.param.type;
		if (type && ts.isTypeReferenceNode(type) && /Event$/.test(type.typeName.getText(this.sf))) {
			return true;
		}
		return this.handlerAttribute(found.fn) !== null;
	}

	/**
	 * The `on*` attribute an inline handler is passed to.
	 *
	 * @param {ts.Node} fn
	 */
	handlerAttribute(fn) {
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
	 *
	 * @param {ts.Node} node
	 */
	targetsControl(node) {
		const found = this.parameterOf(node);
		if (!found) return false;
		// Unannotated, the project's types still name a handler a component
		// passes on to a control: `<Input onChange={(e) => …}>`.
		const inferred = found.param.type ? null : this.projectType(found.param);
		const type =
			found.param.type?.getText(this.sf) ??
			(inferred ? inferred.checker.typeToString(inferred.type) : '');
		if (
			/(ChangeEvent|FormEvent)<\s*(?:HTML(?:Input|TextArea|Select)Element\s*[|,]?\s*)+>$/.test(type)
		)
			return true;
		const attribute = this.handlerAttribute(found.fn);
		if (!attribute || !/^on(Change|Input|Focus|Blur)/.test(attribute.name.getText(this.sf)))
			return false;
		const tag = attribute.parent.parent.tagName.getText(this.sf);
		return tag === 'input' || tag === 'textarea' || tag === 'select';
	}

	/** @param {ts.ClassDeclaration | ts.ClassExpression} node */
	checkClass(node) {
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

	/** @param {ts.BinaryExpression} node */
	checkDefaultProps(node) {
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

	/** @param {ts.JsxAttributes} node */
	rewriteAttributes(node) {
		const element = node.parent;
		const tag = element.tagName.getText(this.sf);
		const intrinsic = /^[a-z]/.test(tag);
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
			if (!ts.isJsxAttribute(attribute) || !intrinsic) {
				out += this.emit(attribute, PLAIN);
				continue;
			}
			const name = attribute.name.getText(this.sf);
			if (
				name === 'className' &&
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

	/** @param {ts.JsxAttribute} attribute */
	emitInitializer(attribute) {
		if (!attribute.initializer) return '';
		return (
			this.source.slice(attribute.name.end, attribute.initializer.getStart(this.sf)) +
			this.emit(attribute.initializer, PLAIN)
		);
	}

	/**
	 * Whether `element` is a text-entry control, where React's `onChange` fires
	 * per edit and the native `change` fires on commit.
	 *
	 * @param {ts.JsxOpeningLikeElement} element
	 */
	isTextEntry(element) {
		const tag = element.tagName.getText(this.sf);
		if (tag === 'textarea') return true;
		if (tag !== 'input') return false;
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

	/**
	 * @param {ts.JsxElement} node
	 * @param {Context} ctx
	 */
	rewriteElement(node, ctx) {
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
		if (
			declaration &&
			this.descriptorComponents.has(/** @type {ts.VariableDeclaration} */ (declaration))
		) {
			return this.span(node, node.getStart(this.sf), node.end, PLAIN);
		}
		const name = this.calleeName(tag);
		if (name === 'StrictMode') {
			// Octane's StrictMode is a pass-through wrapper.
			this.count(RULE.strictMode);
			return this.emitChildren(node, ctx);
		}
		if (name === 'Suspense' && ctx.template) return this.rewriteSuspense(node);
		if (ts.isPropertyAccessExpression(tag) && this.isContext(tag.expression)) {
			if (tag.name.text === 'Consumer') return this.rewriteConsumer(node, ctx);
		}
		return null;
	}

	/**
	 * Whether `node` is a React context, by where it comes from: a
	 * `createContext` call here, or an export the project knows is one. Only
	 * a package's export, which the codemod cannot see, is judged by its name.
	 *
	 * @param {ts.Expression} node
	 */
	isContext(node) {
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
	 *
	 * @param {ts.Expression} node
	 * @returns {boolean}
	 */
	createsContext(node) {
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
	 *
	 * @param {ts.BinaryExpression} node
	 */
	rewriteRenderProp(node) {
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
	 *
	 * @param {ts.JsxElement | ts.JsxFragment} node
	 * @param {Context} ctx
	 */
	emitChildren(node, ctx) {
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
	 *
	 * @param {ts.JsxElement} node
	 * @param {Context} ctx
	 */
	rewriteConsumer(node, ctx) {
		const tag = /** @type {ts.PropertyAccessExpression} */ (node.openingElement.tagName);
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
	 *
	 * @param {ts.JsxElement} node
	 */
	rewriteSuspense(node) {
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
		let pending;
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
	 * @param {string} text
	 * @param {ts.Node} node
	 * @param {string} [deeper] how far inside `node`'s line the text's own
	 *   first line sat, such as the children of an element
	 */
	relative(text, node, deeper = '') {
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
	 * @param {string} text relative text
	 * @param {ts.Node} node the node it replaces
	 */
	absolute(text, node) {
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
	 * @param {string} head
	 * @param {string} body relative text
	 */
	block(head, body) {
		if (!body.includes('\n') && !body.startsWith('@') && head.length + body.length < 80) {
			return `${head} { ${body} }`;
		}
		const unit = this.indentUnit;
		const lines = body.split('\n').map((line) => (line === '' ? '' : unit + line));
		return `${head} {\n${lines.join('\n')}\n}`;
	}

	/**
	 * The text before `node` on its line.
	 *
	 * @param {ts.Node} node
	 */
	linePrefix(node) {
		const start = node.getStart(this.sf);
		return this.source.slice(this.source.lastIndexOf('\n', start - 1) + 1, start);
	}

	/** @param {ts.Node} node */
	indentOf(node) {
		const prefix = this.linePrefix(node);
		return prefix.slice(0, prefix.length - prefix.trimStart().length);
	}

	/**
	 * Template control flow for a JSX child hole.
	 *
	 * @param {ts.JsxExpression} node
	 */
	rewriteHole(node) {
		if (!node.expression || node.dotDotDotToken) return null;
		const directive = this.directive(node.expression);
		if (directive === null) return this.textHole(node);
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
	 *
	 * @param {ts.JsxExpression} node
	 */
	textHole(node) {
		const expression = /** @type {ts.Expression} */ (node.expression);
		if (!this.textTypes || isTextSpelling(expression)) return null;
		const kind = textKind(this.typeOf(expression));
		if (kind === 0) return null;
		this.count(RULE.text);
		const value = this.emit(expression, PLAIN);
		let text;
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
	 * The type of `node` in the project's program, which resolves imports and
	 * packages, or null when the program does not have this module.
	 *
	 * @param {ts.Node} node
	 * @returns {{ type: ts.Type, checker: ts.TypeChecker } | null}
	 */
	projectType(node) {
		const types = this.options.types;
		if (types?.sourceFile.text !== this.source) return null;
		const same = nodeSpanning(types.sourceFile, node.getStart(this.sf), node.end);
		if (same?.kind !== node.kind) return null;
		return { type: types.checker.getTypeAtLocation(same), checker: types.checker };
	}

	/**
	 * The type of `expression`, from the project's program when it has this
	 * module, else from the module's own.
	 *
	 * @param {ts.Expression} expression
	 */
	typeOf(expression) {
		return this.projectType(expression)?.type ?? this.checker.getTypeAtLocation(expression);
	}

	/**
	 * Comments in `[from, to)` whose text `kept` does not already carry.
	 *
	 * @param {number} from
	 * @param {number} to
	 * @param {string} kept
	 */
	lostComments(from, to, kept) {
		const scanner = ts.createScanner(
			ts.ScriptTarget.Latest,
			false,
			ts.LanguageVariant.Standard,
			this.source,
			undefined,
			from,
			to - from,
		);
		/** @type {string[]} */
		const lost = [];
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
	 *
	 * @param {ts.Expression} expression
	 * @returns {string | null}
	 */
	directive(expression) {
		const node = skipParens(expression);
		if (ts.isConditionalExpression(node)) return this.ifDirective(node);
		if (
			ts.isBinaryExpression(node) &&
			node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
			isBoolean(node.left, (name) => this.constValue(name))
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
	 *
	 * @param {ts.Expression} expression
	 * @returns {string | null}
	 */
	arm(expression) {
		const node = skipParens(expression);
		if (isJsx(node)) return this.relative(this.emit(node, TEMPLATE), node);
		if (isNullish(node)) return '';
		return this.directive(node);
	}

	/** @param {ts.ConditionalExpression} node */
	ifDirective(node) {
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
	 *
	 * @param {ts.CallExpression} node
	 */
	forDirective(node) {
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
		if (reads(callee.expression, (name) => bound.has(name))) return null;
		// A `function` row sees its own `this` and `arguments`; an arm does not.
		if (ts.isFunctionExpression(fn) && usesOwnThis(fn.body)) return null;
		// A row that writes an outer variable (`n++`) needs every row to run in
		// order; an `@for` row can be skipped.
		if (this.writesOuter(fn)) return null;

		/** @type {ts.Statement[]} */
		let setup = [];
		/** @type {ts.Expression} */
		let output;
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
		let key = null;
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
					/** @type {ts.JsxAttribute} */ (keys[0]),
					'This row key reads a value computed in the row, so the list stays a `.map()`.',
				);
				return null;
			}
		}
		const hoisted = key ? /** @type {ts.JsxAttribute[]} */ (keys) : [];
		/** @type {ts.JsxElement[]} A keyed `<Fragment>` is a bare row. */
		const fragments = [];
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

	/**
	 * Whether `fn` assigns a variable declared outside it.
	 *
	 * @param {ts.ArrowFunction | ts.FunctionExpression} fn
	 */
	writesOuter(fn) {
		/** @type {(node: ts.Node) => boolean} */
		const visit = (node) => {
			let target = null;
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
			if (target && ts.isIdentifier(skipParens(target))) {
				const declaration = this.declarationOf(/** @type {ts.Identifier} */ (skipParens(target)));
				if (declaration && (declaration.pos < fn.pos || declaration.end > fn.end)) return true;
			}
			return ts.forEachChild(node, visit) ?? false;
		};
		return visit(fn.body);
	}

	/**
	 * Whether every `return` in a list row's setup leaves the row empty, the
	 * only early exit a directive arm allows.
	 *
	 * @param {ts.Statement[]} statements
	 */
	armReturnsOnlyEmpty(statements) {
		let ok = true;
		const visit = (/** @type {ts.Node} */ node) => {
			if (isFunctionLike(node)) return;
			if (ts.isReturnStatement(node) && node.expression && !isNullish(node.expression)) ok = false;
			node.forEachChild(visit);
		};
		statements.forEach(visit);
		return ok;
	}

	/**
	 * @param {ts.Node} expression
	 * @param {ts.Statement[]} statements
	 */
	readsLocals(expression, statements) {
		const declared = new Set(
			statements
				.filter(ts.isVariableStatement)
				.flatMap((statement) => statement.declarationList.declarations)
				.flatMap((declaration) => bindingNames(declaration.name)),
		);
		return reads(expression, (name) => declared.has(name));
	}

	// ---------------------------------------------------------------- components

	/**
	 * Rewrite a component whose last statement returns JSX as a template body:
	 * `function C() { setup; return <div /> }` is `function C() @{ setup; <div /> }`.
	 *
	 * @param {ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction} node
	 */
	rewriteComponent(node) {
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
	 * @param {ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction} node
	 * @param {ts.Block} body
	 * @param {number} first the index of the first guard
	 */
	rewriteGuards(node, body, first) {
		const statements = body.statements;
		const last = /** @type {ts.ReturnStatement} */ (statements[statements.length - 1]);
		// Setup before the first guard stays in the body, which may return a
		// value early; the rest moves into arms, which may only return nothing.
		const rest = statements.slice(first + 1, -1).filter((statement) => !guardReturn(statement));
		if (returnsJsx(statements.slice(0, first)) || !this.armReturnsOnlyEmpty(rest)) return null;
		const output = this.arm(/** @type {ts.Expression} */ (last.expression));
		if (output === null) return null;
		/** @type {(from: number) => string} */
		const chain = (from) => {
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
			const guard = /** @type {ts.IfStatement} */ (statements[at]);
			this.count(RULE.if);
			const then = this.block(
				`@if (${this.emit(guard.expression, PLAIN)})`,
				/** @type {string} */ (this.arm(/** @type {ts.Expression} */ (guardReturn(guard)))),
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
	 *
	 * @param {ts.Expression} node
	 */
	output(node) {
		if (isJsx(node)) return this.emit(node, TEMPLATE);
		if (ts.isConditionalExpression(node) || ts.isCallExpression(node)) {
			const directive = this.directive(node);
			return directive === null ? null : this.absolute(directive, node);
		}
		return null;
	}

	/** @param {ts.Node} node */
	startsLine(node) {
		return this.linePrefix(node).trim() === '';
	}

	/**
	 * Whether `node` is a component definition: a capitalized function, or the
	 * function passed to `memo` / `forwardRef`, or a default-exported one.
	 *
	 * @param {ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction} node
	 */
	isComponent(node) {
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
