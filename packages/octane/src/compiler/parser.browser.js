import { acorn, tsPlugin, getCommentHandlers, parseModule as parseTsrx } from '@tsrx/core';
import { isolateOutputOptions, publishOutput } from './parser-output.js';
import { adoptTemplateShape } from './parser-template-shape.js';

// The TypeScript parser currently enters type context after consuming `{`, so a
// first generic call signature is tokenized as JSX. Enter before its first token;
// leave before consuming `}` so the following ordinary JavaScript stays intact.
const createTypeScriptParser = (jsx) =>
	acorn.Parser.extend(
		tsPlugin({ jsx }),
		(Base) =>
			class extends Base {
				tsParseDeclaration(node, value, next) {
					// `module` has additional TSRX semantics. The compatibility parser must
					// never reinterpret a server block as an ordinary TypeScript namespace.
					if (value === 'module' && jsx) {
						throw new SyntaxError('TSRX module requires the TSRX parser');
					}
					const declaration = super.tsParseDeclaration(node, value, next);
					if (value === 'namespace' || value === 'module') {
						for (
							let current = declaration;
							current?.type === 'TSModuleDeclaration';
							current = current.body
						) {
							current.kind = value;
							current.metadata = { path: [], module_keyword: value };
						}
					}
					return declaration;
				}
				finishNode(node, type) {
					const finished = super.finishNode(node, type);
					if (type === 'TSModuleDeclaration' && finished.global) {
						finished.kind = 'global';
						delete finished.global;
					}
					return finished;
				}
				tsParseInterfaceBody() {
					const previous = this.inType;
					let members;
					this.inType = true;
					try {
						this.expect(acorn.tokTypes.braceL);
						members = this.tsParseList('TypeMembers', this.tsParseTypeMember.bind(this));
					} finally {
						this.inType = previous;
					}
					this.expect(acorn.tokTypes.braceR);
					return members;
				}
			},
	);
const TypeScriptParser = createTypeScriptParser(true);
// `.ts`, `.mts`, and `.cts` source has no JSX, so `<T>value` is a type assertion
// and `module` is TypeScript's own keyword, shaped as the native parser shapes it.
const TypeScriptModuleParser = createTypeScriptParser(false);

function supportsTypeScriptRetry(program) {
	let genericSyntax = false;
	let tsrxSyntax = false;
	function visit(node, jsxType = false) {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) visit(child, jsxType);
			return;
		}
		if (node.type === 'TSCallSignatureDeclaration' && node.typeParameters) genericSyntax = true;
		if (jsxType && node.type === 'TSQualifiedName') genericSyntax = true;
		// Raw-text elements and template directives require the TSRX lexer.
		if (
			node.type === 'JSXElement' &&
			!node.openingElement.selfClosing &&
			['style', 'script'].includes(node.openingElement.name.name)
		)
			tsrxSyntax = true;
		if (node.type === 'JSXText' && node.value.includes('@')) tsrxSyntax = true;
		for (const [key, child] of Object.entries(node)) {
			if (key === 'loc' || key === 'metadata' || key.endsWith('Comments')) continue;
			visit(
				child,
				jsxType ||
					(node.type === 'JSXOpeningElement' &&
						(key === 'typeParameters' || key === 'typeArguments')),
			);
		}
	}
	visit(program);
	return genericSyntax && !tsrxSyntax;
}

function parseTypeScript(source, options, Parser = TypeScriptParser) {
	const comments = [];
	const { onComment, add_comments } = getCommentHandlers(source, comments);
	const keywordTokens = options?.keywordTokens ? [] : null;
	const program = Parser.parse(source, {
		sourceType: 'module',
		ecmaVersion: 'latest',
		locations: true,
		preserveParens: !!options?.preserveParens,
		onComment,
		onToken:
			keywordTokens === null
				? undefined
				: (token) => {
						const keyword =
							token.type.keyword === 'function'
								? 'function'
								: token.type.label === 'name' && token.value === 'async'
									? 'async'
									: null;
						if (keyword !== null)
							keywordTokens.push({
								value: keyword,
								start: token.start,
								end: token.end,
								loc: token.loc,
							});
					},
	});
	if (Parser === TypeScriptParser && !supportsTypeScriptRetry(program))
		throw new SyntaxError('Unsupported TSRX compatibility retry');
	add_comments(program);
	if (keywordTokens !== null) program.tsrx_keyword_tokens = keywordTokens;
	if (options?.comments) options.comments.push(...comments);
	return program;
}

/**
 * Parse a `.ts`, `.mts`, or `.cts` module with TypeScript's grammar, keeping
 * `import type`, parameter properties, `declare` fields, and every annotation.
 * Returns null for declaration files, the `.object.ts` dialect, and every other
 * filename, and when the grammar rejects the source, so the TSRX lanes decide.
 */
export function parseTypeScriptModule(source, filename, options) {
	const pathname = typeof filename === 'string' ? filename.split(/[?#]/, 1)[0] : '';
	if (!/\.[cm]?ts$/.test(pathname) || /\.d\.[cm]?ts$|\.object\.ts$/.test(pathname)) return null;
	const output = isolateOutputOptions(options);
	let program;
	try {
		program = parseTypeScript(source, output, TypeScriptModuleParser);
	} catch (error) {
		if (error instanceof SyntaxError) return null;
		throw error;
	}
	publishOutput(options, output);
	return program;
}

/** Preserve TSRX parsing and recovery; retry rejected ordinary TS/JSX modules. */
export function parseModule(source, filename, options) {
	return adoptTemplateShape(parseAuthoredModule(source, filename, options));
}

/** `parseModule` for the editor's type-only output, which core prints. */
export function parseEditorModule(source, filename, options) {
	return adoptTemplateShape(parseAuthoredModule(source, filename, options), true);
}

function parseAuthoredModule(source, filename, options) {
	const typeScript = parseTypeScriptModule(source, filename, options);
	if (typeScript !== null) return typeScript;
	const primary = isolateOutputOptions(options);
	let program;
	try {
		program = parseTsrx(source, filename, primary);
	} catch (error) {
		if (!(error instanceof SyntaxError)) {
			publishOutput(options, primary);
			throw error;
		}
		const alternative = isolateOutputOptions(options, true);
		try {
			program = parseTypeScript(source, alternative);
		} catch (alternativeError) {
			publishOutput(options, primary);
			throw alternativeError instanceof SyntaxError ? error : alternativeError;
		}
		publishOutput(options, alternative);
		return program;
	}
	publishOutput(options, primary);
	return program;
}
