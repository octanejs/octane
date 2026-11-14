import ts from 'typescript';
import { hasRuntimeDependency } from './scoped-store-contract.js';
import { skipWrappers } from './expression-wrappers.js';
import { hasEval } from './forwarded-props.js';
import { componentTagOrExport, localUses } from './local-uses.js';
import { bind, nativeReactCompat, skipParens, withoutJsxIndentation } from './transform.js';

export function importsReactBridge(source: string) {
	return (
		((source.includes('ReactCompat') && source.includes('octane/react')) ||
			source.includes('\\')) &&
		ts
			.preProcessFile(source)
			.importedFiles.some(
				({ fileName }) => fileName === 'octane/react' || fileName === 'octane/react/server',
			)
	);
}

async function bindIsland(file: string, source: string) {
	let code = source;
	if (file.endsWith('.tsrx')) {
		const { compileToVolarMappings } = await import('octane/compiler/volar');
		try {
			code = compileToVolarMappings(source, file, { loose: true }).code;
		} catch (error) {
			// Project-wide inspection also encounters unfinished files outside the selected inputs.
			if (error instanceof SyntaxError) return;
			throw error;
		}
	}
	return bind(file.endsWith('.tsrx') ? file + '.tsx' : file, code);
}

function imported(checker: ts.TypeChecker, node: ts.Node) {
	const ref = ts.isPropertyAccessExpression(node) ? node.expression : node;
	if (!ts.isIdentifier(ref)) return;
	const decl = checker.getSymbolAtLocation(ref)?.declarations?.[0];
	if (!decl) return;
	const name = ts.isPropertyAccessExpression(node)
		? ts.isNamespaceImport(decl) && node.name.text
		: ts.isImportSpecifier(decl) && !decl.isTypeOnly
			? (decl.propertyName ?? decl.name).text
			: ts.isImportClause(decl) && 'default';
	const imp = name && ts.findAncestor(decl, ts.isImportDeclaration);
	if (
		imp &&
		!imp.attributes &&
		!imp.importClause?.isTypeOnly &&
		ts.isStringLiteral(imp.moduleSpecifier)
	)
		return { name, module: imp.moduleSpecifier.text };
}

/** Original imported components handed to an authored React island. */
export async function islandComponents(
	file: string,
	source: string,
	original: (module: string) => boolean,
) {
	const bound = await bindIsland(file, source);
	if (!bound) return [];
	const { sf, checker } = bound;
	const components = new Set<string>();
	function component(expr: ts.Expression) {
		const node = skipWrappers(expr);
		if (ts.isConditionalExpression(node)) {
			component(node.whenTrue);
			component(node.whenFalse);
			return;
		}
		if (ts.isBinaryExpression(node)) {
			const op = node.operatorToken.kind;
			if (op === ts.SyntaxKind.AmpersandAmpersandToken) component(node.right);
			else if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) {
				component(node.left);
				component(node.right);
			}
			return;
		}
		const ref = ts.isJsxElement(node)
			? node.openingElement.tagName
			: ts.isJsxSelfClosingElement(node)
				? node.tagName
				: node;
		if (ts.isIdentifier(ref) && ref !== node && /^[a-z]|-/.test(ref.text)) return;
		let value = ref;
		const seen = new Set<ts.VariableDeclaration>();
		for (;;) {
			const entry = imported(checker, value);
			if (entry) {
				components.add(entry.module);
				return;
			}
			if (!ts.isIdentifier(value)) return;
			const symbol = checker.getSymbolAtLocation(value);
			const alias = symbol?.declarations?.length === 1 && symbol.valueDeclaration;
			if (
				!alias ||
				!ts.isVariableDeclaration(alias) ||
				!ts.isVariableDeclarationList(alias.parent) ||
				(alias.parent.flags & ts.NodeFlags.BlockScoped) !== ts.NodeFlags.Const ||
				!ts.isIdentifier(alias.name) ||
				!alias.initializer ||
				seen.has(alias)
			)
				return;
			seen.add(alias);
			value = skipWrappers(alias.initializer);
		}
	}
	function visit(n: ts.Node) {
		if (ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) {
			const tag = imported(checker, n.tagName);
			if (tag && nativeReactCompat(tag.module, tag.name) && original(tag.module)) {
				const prop = n.attributes.properties.find(
					(a) => ts.isJsxAttribute(a) && ts.isIdentifier(a.name) && a.name.text === 'component',
				);
				if (
					prop &&
					ts.isJsxAttribute(prop) &&
					prop.initializer &&
					ts.isJsxExpression(prop.initializer) &&
					prop.initializer.expression
				)
					component(prop.initializer.expression);
				if (ts.isJsxOpeningElement(n)) {
					for (const child of n.parent.children) {
						if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) component(child);
						else if (ts.isJsxExpression(child) && child.expression) component(child.expression);
					}
				}
			}
		}
		ts.forEachChild(n, visit);
	}
	visit(sf);
	return [...components];
}

function* directExportReturns({ sf, checker }: ReturnType<typeof bind>) {
	const module = checker.getSymbolAtLocation(sf);
	if (!module || hasEval(sf)) return;
	const uses = localUses(sf, checker);
	for (const symbol of checker.getExportsOfModule(module)) {
		let decl = symbol.valueDeclaration ?? symbol.declarations?.[0];
		if (!decl) continue;
		let value: ts.Node = decl;
		let defaultRef: ts.Identifier | undefined;
		if (ts.isExportAssignment(decl)) {
			if (decl.isExportEquals) continue;
			value = skipWrappers(decl.expression);
			if (ts.isIdentifier(value)) {
				defaultRef = value;
				decl = checker.getSymbolAtLocation(value)?.valueDeclaration;
				if (!decl || (ts.isVariableDeclaration(decl) && decl.end > value.pos)) continue;
				value = decl;
			}
		}
		const name =
			ts.isVariableDeclaration(value) || ts.isFunctionDeclaration(value) ? value.name : undefined;
		if (
			name &&
			(!ts.isIdentifier(name) ||
				!uses(name).every((ref) => ref === defaultRef || componentTagOrExport(ref)))
		)
			continue;
		if (ts.isVariableDeclaration(value)) {
			if (!(ts.getCombinedNodeFlags(value) & ts.NodeFlags.Const)) continue;
			if (!value.initializer) continue;
			value = skipWrappers(value.initializer);
		}
		const output = returnedJsx(value);
		if (output) yield { name: symbol.name, output, localName: name?.text };
	}
}

function returnedJsx(fn: ts.Node) {
	if (
		!(ts.isFunctionDeclaration(fn) || ts.isFunctionExpression(fn) || ts.isArrowFunction(fn)) ||
		fn.asteriskToken ||
		fn.modifiers?.some((item) => item.kind === ts.SyntaxKind.AsyncKeyword)
	)
		return;
	let value: ts.Expression | undefined;
	if (fn.body && ts.isBlock(fn.body)) {
		const [statement, extra] = fn.body.statements;
		if (!statement || extra || !ts.isReturnStatement(statement)) return;
		value = statement.expression;
	} else value = fn.body;
	const output = value && skipWrappers(value);
	if (output && (ts.isJsxElement(output) || ts.isJsxSelfClosingElement(output))) return output;
}

function openingTag(element: ts.JsxElement | ts.JsxSelfClosingElement) {
	return ts.isJsxElement(element) ? element.openingElement : element;
}

function hostedLeaf(output: ts.JsxElement | ts.JsxSelfClosingElement) {
	const attrs = openingTag(output).attributes.properties;
	const seen = new Set<string>();
	let component: ts.Expression | undefined;
	for (const attr of attrs) {
		if (!ts.isJsxAttribute(attr) || !ts.isIdentifier(attr.name)) return;
		const name = attr.name.text;
		if (
			seen.has(name) ||
			!['component', 'props', 'key', 'hostClassName', 'hostStyle'].includes(name)
		)
			return;
		seen.add(name);
		if (name === 'component') {
			const value = attr.initializer;
			if (!value || !ts.isJsxExpression(value) || !value.expression || value.dotDotDotToken) return;
			component = skipWrappers(value.expression);
		}
	}
	const children = ts.isJsxElement(output)
		? withoutJsxIndentation(output.children).filter(
				(child) => !ts.isJsxExpression(child) || child.expression,
			)
		: [];
	if (component) return children.length === 0 ? component : undefined;
	if (seen.has('props')) return;
	const [child, extra] = children;
	if (!extra && child && (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)))
		return openingTag(child).tagName;
}

function ordinaryReactJsx(source: string) {
	return !(
		/@jsx(?:Frag)?\b/i.test(source) ||
		[...source.matchAll(/@jsxRuntime\s+(\S+)/gi)].some(([, mode]) => mode !== 'automatic') ||
		[...source.matchAll(/@jsxImportSource\s+(\S+)/gi)].some(([, name]) => name !== 'react')
	);
}

/** Runtime imports that an explicit server host returns directly. */
export function hostedServerComponents(file: string, source: string) {
	if (!ordinaryReactJsx(source)) return [];
	const bound = bind(file, source);
	const { sf, checker } = bound;
	const edges = [];
	for (const { output } of directExportReturns(bound)) {
		const tag = openingTag(output).tagName;
		if (ts.isIdentifier(tag) && (/^[a-z]/.test(tag.text) || tag.text.includes('-'))) continue;
		const host = imported(checker, tag);
		if (
			host?.module !== 'octane/react/server' ||
			(host.name !== 'OctaneCompat' && host.name !== 'OctaneCompatInline')
		)
			continue;
		const ref = hostedLeaf(output);
		const leaf = ref && imported(checker, ref);
		if (leaf)
			edges.push({ ...leaf, line: sf.getLineAndCharacterOfPosition(output.getStart(sf)).line + 1 });
	}
	return edges;
}

/** A retained component that returns JSX for a directly imported component. */
export function retainedReactComponentReturns(file: string, source: string) {
	if (!ordinaryReactJsx(source)) return [];
	const bound = bind(file, source);
	const { sf, checker } = bound;
	const edges = [];
	const seen = new Set<ts.Node>();
	for (const { output, localName } of directExportReturns(bound)) {
		if (seen.has(output)) continue;
		const tag = openingTag(output).tagName;
		if (localName && !/^[A-Z]/.test(localName)) continue;
		if (ts.isIdentifier(tag) && !/^[A-Z]/.test(tag.text)) continue;
		const leaf = imported(checker, tag);
		if (leaf?.module.startsWith('.') && /\.[jt]sx$/.test(leaf.module)) {
			seen.add(output);
			edges.push({ ...leaf, line: sf.getLineAndCharacterOfPosition(output.getStart(sf)).line + 1 });
		}
	}
	return edges;
}

/** Existing Octane roots that render a directly imported component body. */
export function octaneRootComponents(file: string, source: string) {
	const { sf, checker } = bind(file, source);
	const edges: {
		runtime: 'octane' | 'octane/server';
		module: string;
		name: string;
		line: number;
	}[] = [];
	function clientComponent(call: ts.CallExpression, callee: ts.Expression, hydrate: boolean) {
		if (hydrate && call.arguments.length <= 4) return call.arguments[1];
		if (
			!ts.isPropertyAccessExpression(callee) ||
			ts.isOptionalChain(callee) ||
			callee.name.text !== 'render' ||
			call.arguments.length > 2
		)
			return;
		const root = skipWrappers(callee.expression);
		if (
			ts.isCallExpression(root) &&
			!ts.isOptionalChain(root) &&
			root.arguments.length >= 1 &&
			root.arguments.length <= 2 &&
			!root.arguments.some(ts.isSpreadElement)
		) {
			const factory = imported(checker, skipWrappers(root.expression));
			if (factory?.module === 'octane' && factory.name === 'createRoot') return call.arguments[0];
		}
	}
	function visit(node: ts.Node) {
		if (
			ts.isCallExpression(node) &&
			!ts.isOptionalChain(node) &&
			!node.arguments.some(ts.isSpreadElement)
		) {
			const callee = skipWrappers(node.expression);
			const entry = imported(checker, callee);
			const server = entry?.module === 'octane/server';
			const value = server
				? node.arguments.length <= 3 &&
					(entry.name === 'renderToString' || entry.name === 'renderToStaticMarkup') &&
					node.arguments[0]
				: clientComponent(node, callee, entry?.module === 'octane' && entry.name === 'hydrateRoot');
			const leaf = value ? imported(checker, skipWrappers(value)) : undefined;
			if (leaf?.module.startsWith('.') && /\.[jt]sx$/.test(leaf.module))
				edges.push({
					...leaf,
					runtime: server ? 'octane/server' : 'octane',
					line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
				});
		}
		ts.forEachChild(node, visit);
	}
	visit(sf);
	return edges;
}

/** React server calls that render directly imported components. */
export function reactServerComponents(
	file: string,
	source: string,
	original: (module: 'react' | 'react/jsx-runtime') => boolean,
	topLevel = false,
) {
	const { sf, checker } = bind(file, source);
	const edges: { module: string; name: string; line: number }[] = [];
	function visit(node: ts.Node) {
		if (ts.isCallExpression(node) && !ts.isOptionalChain(node) && node.arguments.length === 1) {
			const callee = imported(checker, node.expression);
			if (
				callee?.module === 'react-dom/server' &&
				(callee.name === 'renderToString' || callee.name === 'renderToStaticMarkup')
			) {
				const value = skipWrappers(node.arguments[0]);
				let ref: ts.Node | undefined;
				const jsx =
					ts.isJsxSelfClosingElement(value) ||
					(ts.isJsxElement(value) &&
						withoutJsxIndentation(value.children).every(
							(child) => ts.isJsxExpression(child) && !child.expression,
						))
						? openingTag(value)
						: undefined;
				if (
					jsx &&
					(!ts.isIdentifier(jsx.tagName) || /^[A-Z][\w$]*$/.test(jsx.tagName.text)) &&
					jsx.attributes.properties.length === 0 &&
					ordinaryReactJsx(source) &&
					original('react/jsx-runtime')
				)
					ref = jsx.tagName;
				if (
					ts.isCallExpression(value) &&
					!ts.isOptionalChain(value) &&
					(value.arguments.length === 1 ||
						(value.arguments.length === 2 &&
							skipWrappers(value.arguments[1]).kind === ts.SyntaxKind.NullKeyword))
				) {
					const factory = imported(checker, value.expression);
					if (factory?.module === 'react' && factory.name === 'createElement' && original('react'))
						ref = skipWrappers(value.arguments[0]);
				}
				const leaf = ref && imported(checker, ref);
				if (leaf?.module.startsWith('.') && /\.[jt]sx$/.test(leaf.module))
					edges.push({
						...leaf,
						line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
					});
			}
		}
		if (!topLevel) ts.forEachChild(node, visit);
	}
	if (topLevel) {
		for (const statement of sf.statements) {
			if (!ts.isVariableStatement(statement)) continue;
			for (const declaration of statement.declarationList.declarations) {
				const call = declaration.initializer && skipParens(declaration.initializer);
				if (!call || !ts.isCallExpression(call)) continue;
				const argument = call.arguments[0] && skipParens(call.arguments[0]);
				if (argument && ts.isJsxSelfClosingElement(argument) && ts.isIdentifier(argument.tagName))
					visit(call);
			}
		}
	} else visit(sf);
	return edges;
}

/** Local exports whose original body returns an intrinsic React element. */
export function intrinsicReactExports(file: string, source: string) {
	const names = new Set<string>();
	if (ordinaryReactJsx(source)) {
		for (const { name, output, localName } of directExportReturns(bind(file, source))) {
			const tag = openingTag(output).tagName;
			if (
				ts.isIdentifier(tag) &&
				/^[a-z]/.test(tag.text) &&
				(!localName || /^[A-Z]/.test(localName))
			)
				names.add(name);
		}
	}
	return names;
}

/** Inspect the emitted local export before assigning a reverse island to a server host. */
export async function reverseIslandExports(
	file: string,
	source: string,
	original: (module: string) => boolean,
) {
	const names = new Set<string>();
	if (!importsReactBridge(source)) return names;
	const bound = await bindIsland(file, source);
	if (!bound) return names;
	for (const { name, output } of directExportReturns(bound)) {
		const island = imported(bound.checker, openingTag(output).tagName);
		if (island && nativeReactCompat(island.module, island.name) && original(island.module))
			names.add(name);
	}
	return names;
}

/** Declaration-level type imports disappear even with verbatimModuleSyntax. */
export function executableImports(file: string, source: string, verbatim: boolean) {
	const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest);
	const imports: string[] = [];
	function visit(node: ts.Node) {
		if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
			if (
				hasRuntimeDependency(node, verbatim) &&
				node.moduleSpecifier &&
				ts.isStringLiteral(node.moduleSpecifier)
			)
				imports.push(node.moduleSpecifier.text);
			return;
		}
		if (
			ts.isCallExpression(node) &&
			node.expression.kind === ts.SyntaxKind.ImportKeyword &&
			node.arguments[0] &&
			ts.isStringLiteralLike(node.arguments[0])
		)
			imports.push(node.arguments[0].text);
		ts.forEachChild(node, visit);
	}
	visit(sf);
	return imports;
}
