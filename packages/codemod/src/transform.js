import ts from 'typescript';
import {
	DEPENDENCY_HOOKS,
	REACT_MODULES,
	TEXT_INPUT_TYPES,
	UNSUPPORTED_VALUES,
	mapQualifiedType,
	mapReactImport,
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
 * @property {(specifier: string) => string | null} [resolveSpecifier] the new
 *   spelling of an import specifier (a renamed module, a binding package), or
 *   null to keep it.
 * @property {(specifier: string, name: string) => boolean | null} [isContext]
 *   whether an imported name is a context, or null when it cannot be known
 *
 * @typedef {Object} TransformResult
 * @property {string} code
 * @property {boolean} changed
 * @property {boolean} template whether the module now holds `.tsrx` template
 *   syntax, so it must be renamed
 * @property {Note[]} notes
 * @property {Record<string, number>} rules how often each rule fired
 * @property {ModuleExports} exports what the module exports that other modules'
 *   rewrites depend on
 *
 * @typedef {Object} ModuleExports
 * @property {string[]} contexts exported names whose value is a context this
 *   module creates
 * @property {{ specifier: string, names: [string, string][] | null }[]} reexports
 *   `export … from` declarations: [imported, exported] pairs, or null for `*`
 */

/**
 * @typedef {{ template: boolean }} Context
 * @typedef {{ module: string, local: string, imported: string, namespace: boolean, typeOnly: boolean }} Import
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
	classComponent: 'class-component',
	consumer: 'context-consumer',
	defaultProps: 'default-props',
	deps: 'hook-dependencies',
	eventObject: 'event-object',
	forwardRef: 'forward-ref',
	import: 'imports',
	legacyRoot: 'legacy-root',
	nativeChange: 'native-text-change',
	className: 'class-attribute',
	provider: 'context-provider',
	strictMode: 'strict-mode',
	component: 'template-component',
	if: 'template-if',
	for: 'template-for',
	try: 'template-try',
	unsupported: 'unsupported-api',
	strong: 'strong',
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
 * Parse and bind one module on its own, with no libraries and no module
 * resolution. Binding is enough to map every name to the declaration it refers
 * to, so a shadowed `useState` or event parameter is never mistaken for another.
 *
 * @param {string} filename
 * @param {string} source
 */
function bind(filename, source) {
	const sf = ts.createSourceFile(
		filename,
		source,
		ts.ScriptTarget.Latest,
		true,
		scriptKind(filename),
	);
	/** @type {ts.CompilerHost} */
	const host = {
		getSourceFile: (name) => (name === filename ? sf : undefined),
		getDefaultLibFileName: () => 'lib.d.ts',
		writeFile: () => {},
		getCurrentDirectory: () => '',
		getCanonicalFileName: (name) => name,
		useCaseSensitiveFileNames: () => true,
		getNewLine: () => '\n',
		fileExists: (name) => name === filename,
		readFile: () => undefined,
	};
	const program = ts.createProgram({
		rootNames: [filename],
		options: { noLib: true, noResolve: true, allowJs: true, jsx: ts.JsxEmit.Preserve, types: [] },
		host,
	});
	return { sf, checker: program.getTypeChecker() };
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
 *
 * @param {ts.Expression} node
 * @returns {boolean}
 */
function isBoolean(node) {
	node = skipParens(node);
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
				return isBoolean(node.left) && isBoolean(node.right);
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
		/** @type {ts.ImportDeclaration[]} Placeholder index -> import declaration. */
		this.importSlots = [];
		this.hasJsx = false;
		/** Whether the module imports React, rather than already being Octane. */
		this.fromReact = false;
	}

	/** @returns {TransformResult} */
	run() {
		this.analyze();
		let code = this.emit(this.sf, PLAIN, 0);
		code = this.finishImports(code);
		code = code.replace(/^[ \t]*\u0000DROP\u0000[ \t]*\r?\n/gm, '').replaceAll(DROP, '');
		code = code.replaceAll(LITERAL_NEWLINE, '\n');
		if (this.template)
			code = code.replace(/^\/\*\*\s*@jsxImportSource\s+\S+\s*\*\/[ \t]*\r?\n/m, '');
		if (this.strong && this.template) code = this.addStrongDirective(code);
		if (!this.template && this.fromReact && this.hasJsx && /\.(?:[jt]sx|js)$/.test(this.filename)) {
			code = this.addJsxPragma(code);
		}
		return {
			code,
			changed: code !== this.source,
			template: this.template,
			notes: this.notes.sort((a, b) => a.line - b.line),
			rules: this.rules,
			exports: this.exportsOf(),
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
		for (const statement of this.sf.statements) {
			if (!ts.isImportDeclaration(statement) || !statement.importClause) continue;
			const module = /** @type {ts.StringLiteral} */ (statement.moduleSpecifier).text;
			if (module in REACT_MODULES) this.fromReact = true;
			const clause = statement.importClause;
			const record = (
				/** @type {ts.Node} */ declaration,
				/** @type {ts.Identifier} */ name,
				/** @type {string} */ imported,
				/** @type {boolean} */ typeOnly,
			) => {
				const entry = { module, local: name.text, imported, namespace: imported === '*', typeOnly };
				this.imports.set(declaration, entry);
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
		const visit = (/** @type {ts.Node} */ node) => {
			if (ts.isIdentifier(node) && declaresName(node)) this.declared.add(node.text);
			if (isJsx(node)) this.hasJsx = true;
			ts.forEachChild(node, visit);
		};
		visit(this.sf);
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
				!this.checker.getSymbolAtLocation(node)
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
			if (entry) this.used.add(entry.local);
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
		if (ts.isBinaryExpression(node)) this.checkDefaultProps(node);
		if (ts.isJsxAttributes(node)) return this.rewriteAttributes(node);
		if (ts.isJsxElement(node)) return this.rewriteElement(node, ctx);
		if (ts.isJsxExpression(node) && ctx.template) return this.rewriteHole(node);
		if (
			ts.isFunctionDeclaration(node) ||
			ts.isFunctionExpression(node) ||
			ts.isArrowFunction(node)
		) {
			const component = this.target === 'tsrx' ? this.rewriteComponent(node) : null;
			if (component !== null || !this.parameters.has(node) || !node.body) return component;
			return this.head(node, node.body.getStart(this.sf)) + this.emit(node.body, PLAIN);
		}
		return null;
	}

	// ---------------------------------------------------------------- imports

	/** @param {ts.ImportDeclaration} node */
	rewriteImport(node) {
		const module = /** @type {ts.StringLiteral} */ (node.moduleSpecifier).text;
		if (module === 'octane') return null;
		if (module in REACT_MODULES) {
			this.importSlots.push(node);
			return `\u0000IMPORT${this.importSlots.length - 1}\u0000`;
		}
		return this.rewriteSpecifier(node, node.moduleSpecifier);
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
		return this.rewriteSpecifier(node, /** @type {ts.Expression} */ (node.moduleSpecifier));
	}

	/**
	 * @param {ts.Node} node
	 * @param {ts.Expression} specifier
	 */
	rewriteSpecifier(node, specifier) {
		if (!ts.isStringLiteral(specifier)) return null;
		const next = this.options.resolveSpecifier?.(specifier.text) ?? null;
		if (next === null || next === specifier.text) return null;
		this.count(RULE.import);
		return this.replaceSpecifier(node, specifier, next);
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
					add(mapped.module, mapped.name, local, typeOnly);
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
		for (const [module, names] of imports) {
			const specs = [...names.values()];
			for (const { name, local } of specs) {
				if (name === '*') lines.push(`import * as ${local} from '${module}';`);
			}
			const named = specs.filter(({ name }) => name !== '*');
			if (named.length === 0) continue;
			const allTypes = named.every(({ typeOnly }) => typeOnly);
			const list = named.map(
				({ name, local, typeOnly }) =>
					(typeOnly && !allTypes ? 'type ' : '') + (name === local ? name : `${name} as ${local}`),
			);
			lines.push(`import ${allTypes ? 'type ' : ''}{ ${list.join(', ')} } from '${module}';`);
		}
		for (const [module, specs] of kept)
			lines.push(`import { ${specs.join(', ')} } from '${module}';`);

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

	/**
	 * Where new imports go when the module imported nothing from React: after
	 * the directive prologue and any leading comments.
	 *
	 * @param {string} code
	 */
	insertionPoint(code) {
		// Whole lines only: a shebang, blank lines, comments that end their
		// line, and directive lines. Anything inserted here starts a line, so
		// the Strong fallback can find its own directive line again.
		const prologue =
			/^(?:#![^\n]*\n)?(?:[ \t]*(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/[ \t]*|(['"])use [a-z ]+\1;?[^\n]*)?\r?\n)*/.exec(
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
		if (
			node.name.text === 'Provider' &&
			(ts.isJsxOpeningElement(tag) ||
				ts.isJsxClosingElement(tag) ||
				ts.isJsxSelfClosingElement(tag)) &&
			tag.tagName === node &&
			this.isContext(node.expression)
		) {
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

	/** @param {ts.QualifiedName} node */
	rewriteQualifiedType(node) {
		const namespace = this.importOf(node.left);
		if (!namespace?.namespace || !(namespace.module in REACT_MODULES)) return null;
		const name = mapQualifiedType(node.right.text);
		if (!name) {
			this.used.add(namespace.local);
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
		if (
			ts.isQualifiedName(name) &&
			ts.isIdentifier(name.left) &&
			name.left.text === 'JSX' &&
			!this.checker.resolveName('JSX', node, ts.SymbolFlags.Namespace, false)
		) {
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
		const callee = this.callee(node.expression);
		// An Octane hook without a list already means "inferred".
		if (!callee || callee.module === 'octane') return null;
		const name = callee.name;
		if (name === 'forwardRef') return this.rewriteForwardRef(node);
		if (name === 'render' || name === 'hydrate') return this.rewriteLegacyRoot(node, name);
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
		const refType = typeArgs?.[0]?.getText(this.sf) ?? this.refTypeOf(ref);
		const propsType =
			typeArgs?.[1]?.getText(this.sf) ?? (props?.type ? this.emit(props.type, PLAIN) : null);
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
			return type.typeArguments[0].getText(this.sf);
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
		const elementText = this.emit(element, PLAIN);
		const containerText = this.emit(container, PLAIN);
		return name === 'render'
			? `${this.require('octane', 'createRoot', false)}(${containerText}).render(${elementText})`
			: `${this.require('octane', 'hydrateRoot', false)}(${containerText}, ${elementText})`;
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
		const type = found.param.type?.getText(this.sf) ?? '';
		if (/(ChangeEvent|FormEvent)<\s*HTML(Input|TextArea|Select)Element\s*>$/.test(type))
			return true;
		const attribute = this.handlerAttribute(found.fn);
		if (!attribute || !/^on(Change|Input)/.test(attribute.name.getText(this.sf))) return false;
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
		const named = (/** @type {string} */ name) =>
			attributes.find((a) => ts.isJsxAttribute(a) && a.name.getText(this.sf) === name);

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
			if (!ts.isJsxAttribute(attribute) || !intrinsic) {
				out += this.emit(attribute, PLAIN);
				continue;
			}
			const name = attribute.name.getText(this.sf);
			if (name === 'className' && this.target === 'tsrx' && !named('class') && !spread) {
				this.count(RULE.className);
				out += 'class' + this.emitInitializer(attribute);
			} else if ((name === 'onChange' || name === 'onChangeCapture') && this.isTextEntry(element)) {
				const input = name === 'onChange' ? 'onInput' : 'onInputCapture';
				if (named(input)) {
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
		const type = element.attributes.properties.find(
			(a) => ts.isJsxAttribute(a) && a.name.getText(this.sf) === 'type',
		);
		if (!type || !ts.isJsxAttribute(type)) return true;
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
			const value = declaration.initializer && skipParens(declaration.initializer);
			return (
				!!value &&
				ts.isCallExpression(value) &&
				this.calleeName(value.expression) === 'createContext'
			);
		}
		const entry = declaration ? this.imports.get(declaration) : null;
		if (!entry || entry.namespace) return false;
		const name = entry.imported === 'default' ? entry.local : entry.imported;
		return this.options.isContext?.(entry.module, entry.imported) ?? /Context$/.test(name);
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
		if (directive === null) return null;
		// Comments the directive did not carry over sit before it, as JSX
		// comments, since this is a children position.
		const lost = this.lostComments(node.getStart(this.sf) + 1, node.end - 1, directive)
			.map((comment) => `{/* ${commentText(comment)} */}\n`)
			.join('');
		return this.absolute(lost + directive, node);
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
			isBoolean(node.left)
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
		// either side is control flow, and a value arm is a hole.
		if (whenTrue === null && whenFalse === null) return null;
		if ((whenTrue ?? '') === '' && (whenFalse ?? '') === '') return null;
		whenTrue ??= `{${this.emit(skipParens(node.whenTrue), PLAIN)}}`;
		whenFalse ??= `{${this.emit(skipParens(node.whenFalse), PLAIN)}}`;
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

		let key = null;
		/** @type {ts.JsxAttribute | null} */
		let keyAttribute = null;
		if (ts.isJsxElement(root) || ts.isJsxSelfClosingElement(root)) {
			const opening = ts.isJsxElement(root) ? root.openingElement : root;
			const attribute = opening.attributes.properties.find(
				(a) => ts.isJsxAttribute(a) && a.name.getText(this.sf) === 'key',
			);
			if (attribute && ts.isJsxAttribute(attribute)) {
				const value = attribute.initializer;
				const expression = value && ts.isJsxExpression(value) ? value.expression : value;
				if (!expression) return null;
				if (this.readsLocals(expression, setup)) {
					this.note(
						RULE.for,
						'warning',
						attribute,
						'This row key reads a value computed in the row, so the list stays a `.map()`.',
					);
					return null;
				}
				key = expression;
				keyAttribute = attribute;
				this.removed.add(attribute);
				if (
					ts.isJsxElement(root) &&
					opening.attributes.properties.length === 1 &&
					this.calleeName(opening.tagName) === 'Fragment'
				) {
					this.bare.add(root);
				}
			}
		}
		const arm = ts.isConditionalExpression(root)
			? this.ifDirective(root)
			: this.relative(this.emit(root, TEMPLATE), root);
		if (arm === null) {
			if (keyAttribute) this.removed.delete(keyAttribute);
			this.bare.delete(root);
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
