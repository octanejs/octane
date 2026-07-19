/**
 * Type-only lowering of the `module server { … }` dialect for the Volar
 * (IDE / tsrx-tsc) pipeline.
 *
 * The runtime compiler (`compile.js`) owns the real semantics of a server
 * block: it validates isolation, emits the server namespace for SSR, and
 * replaces `import { fn } from 'server'` with RPC stubs for the browser.
 * The Volar path never runs that codegen — it hands the parsed AST to
 * `@tsrx/core`'s typeOnly JSX transform, which used to print the block
 * verbatim. Verbatim `module server { import … }` can NEVER typecheck:
 * a static import inside a namespace body is TS1147, and the companion
 * `import { fn } from 'server'` is TS2307 (no such module). So the
 * documented dialect (docs/ssr.md) was un-typecheckable in editors.
 *
 * This module rewrites the PARSED ast (before the typeOnly transform runs)
 * into plain, checkable TypeScript with identical types:
 *
 *   module server {                      import { db } from './db.ts';
 *     import { db } from './db.ts';      namespace server {
 *     export function f() { … }     →      export function f() { … }
 *   }                                    }
 *   import { f } from 'server';          const { f } = server;
 *
 * The lowered namespace keeps the AUTHORED name and identifier location, so
 * hovering the block's `server` name resolves, and the destructure's `server`
 * reference marks the namespace as used (a server block nobody imports from
 * is the ONE case `noUnusedLocals` still flags — on the authored name, which
 * is the correct signal). A `declare module 'server'` bridge (which would
 * have let the authored import statement survive verbatim) is NOT possible:
 * the virtual TSX is a module, where `declare module 'server'` is a module
 * AUGMENTATION — TS2664 when no module 'server' exists, and TS2666 for the
 * `export =` even when a global stub supplies one; augmentations also merge
 * program-wide, which would break the dialect's file-local semantics. The
 * destructure keeps the import's specifier locations, so hover/rename on the
 * imported names and on the `'server'` source still resolve.
 *
 * Block imports hoist to module top level (namespaces close over module
 * scope, so the body still resolves them — `noUnusedLocals` counts those
 * uses), and each `from 'server'` import becomes a destructure of the
 * namespace value (type-only specifiers become
 * `type x = server.x` aliases). When a hoisted import's
 * local name is also used anywhere in the client module (the compiler's
 * isolation rule stops the server block from referencing client bindings,
 * but nothing stops both sides from importing — or referencing a global
 * named — `db`), hoisting it verbatim would collide or shadow. Those
 * imports hoist as a mangled namespace import instead and are re-bound
 * inside the namespace: `const { db } = __octane_server_import$0;` for
 * value specifiers and `type T = __octane_server_import$0.T;` for
 * type-only ones. (An `import db = …` alias would preserve dual
 * value+type meanings, but the mapping walker rejects
 * TSImportEqualsDeclaration; a colliding CLASS import therefore keeps
 * only its value meaning — an acceptable corner, since a collision
 * already requires the client half to use the same name.)
 *
 * The rewrite is copy-on-write: every replacement node is built with
 * spreads and carries the ORIGINAL node's start/end/loc wherever it
 * corresponds to authored code, so the transform's esrap print emits real
 * source-mapped segments and hover / go-to-def / diagnostics keep mapping
 * back to the .tsrx source. The original parse is never mutated.
 */

/**
 * The lowered namespace deliberately keeps the authored block name: the
 * authored `module server` id already claims `server` in the file (the
 * runtime compiler declares it as a module binding), so reusing it cannot
 * introduce a new collision, and it is what makes hover on the block's
 * name — and on the `'server'` import source, whose span the destructure's
 * init identifier carries — resolve to the block.
 */
const SERVER_MODULE_NAMESPACE = 'server';
const HOISTED_IMPORT_PREFIX = '__octane_server_import$';

/** Object keys that never contain child AST nodes. */
const WALK_SKIP_KEYS = new Set([
	'loc',
	'start',
	'end',
	'range',
	'parent',
	'metadata',
	'leadingComments',
	'trailingComments',
	'comments',
]);

/**
 * Mirrors `isServerModuleDeclaration` in compile.js (a non-ambient
 * `TSModuleDeclaration` authored with the `module` keyword), narrowed to the
 * one name the dialect supports. Blocks with any other name are a hard
 * compile error, so leaving them verbatim (where TS flags them) mirrors the
 * build failure instead of hiding it.
 */
function isServerModuleDeclaration(node) {
	return (
		node?.type === 'TSModuleDeclaration' &&
		node.declare !== true &&
		node.metadata?.module_keyword === 'module' &&
		identifierName(node.id) === 'server'
	);
}

function identifierName(node) {
	if (node?.type === 'Identifier') return node.name;
	if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
	return null;
}

function isServerImport(node) {
	return node?.type === 'ImportDeclaration' && node.source?.value === 'server';
}

/** A synthetic (unmapped) identifier, shaped like a `builders.id()` node. */
function syntheticId(name) {
	return { type: 'Identifier', name, metadata: { path: [] } };
}

/** Copy `node`'s authored location onto a replacement node. */
function withLocation(node, source) {
	if (source?.start != null) node.start = source.start;
	if (source?.end != null) node.end = source.end;
	if (source?.loc != null) node.loc = source.loc;
	node.metadata ??= { path: [] };
	return node;
}

/**
 * Every identifier name that appears OUTSIDE the server block. This
 * deliberately over-approximates "top-level client bindings": a hoisted
 * server import may not only collide with a client import of the same name
 * (a TS2300 duplicate we would introduce) but also shadow a GLOBAL the
 * client code references (e.g. a server-side `import { crypto } from …`
 * changing what client `crypto` resolves to). Treating any outside use of
 * the name as a conflict costs nothing but an alias, and keeps the lowering
 * from ever changing what the client half of the file typechecks against.
 */
function collectOutsideIdentifierNames(ast, declaration) {
	const names = new Set();
	const seen = new WeakSet();
	function walk(node) {
		if (node === null || typeof node !== 'object' || seen.has(node) || node === declaration) {
			return;
		}
		seen.add(node);
		if (Array.isArray(node)) {
			for (const child of node) walk(child);
			return;
		}
		if (typeof node.type !== 'string') return;
		if (node.type === 'Identifier' || node.type === 'JSXIdentifier') {
			names.add(node.name);
		}
		for (const [key, value] of Object.entries(node)) {
			if (WALK_SKIP_KEYS.has(key)) continue;
			if (value !== null && typeof value === 'object') walk(value);
		}
	}
	walk(ast);
	return names;
}

/**
 * `const { a, b: c } = <init>;` rebinding each specifier's imported
 * name to its local name. Property nodes keep the authored specifier
 * locations so hover / rename still target the .tsrx source. `makeInit`
 * builds a fresh init expression per call (nodes are never shared).
 */
function buildDestructure(specifiers, makeInit, locNode) {
	return withLocation(
		{
			type: 'VariableDeclaration',
			kind: 'const',
			declarations: [
				withLocation(
					{
						type: 'VariableDeclarator',
						id: withLocation(
							{
								type: 'ObjectPattern',
								properties: specifiers.map((specifier) =>
									withLocation(
										{
											type: 'Property',
											kind: 'init',
											method: false,
											computed: false,
											shorthand:
												specifier.imported?.type === 'Identifier' &&
												specifier.imported.name === specifier.local?.name,
											key: { ...specifier.imported },
											value: { ...specifier.local },
										},
										specifier,
									),
								),
							},
							locNode,
						),
						init: makeInit(),
					},
					locNode,
				),
			],
		},
		locNode,
	);
}

/** `type <local> = <left>.<imported>;` for a type-only import specifier. */
function buildTypeAlias(specifier, makeLeft) {
	return withLocation(
		{
			type: 'TSTypeAliasDeclaration',
			id: { ...specifier.local },
			typeAnnotation: {
				type: 'TSTypeReference',
				typeName: {
					type: 'TSQualifiedName',
					left: makeLeft(),
					right: { ...specifier.imported },
					metadata: { path: [] },
				},
				metadata: { path: [] },
			},
		},
		specifier,
	);
}

/**
 * Lower one block import whose local name(s) collide with outside code:
 * hoist as a mangled namespace import and rebuild each original binding
 * inside the namespace body. Value specifiers destructure the namespace
 * object; type-only specifiers become `type` aliases; default imports
 * bind `<ns>.default`; a namespace specifier rebinds the whole object.
 */
function lowerCollidingImport(statement, hoistedName) {
	const hoisted = withLocation(
		{
			type: 'ImportDeclaration',
			specifiers: [
				{
					type: 'ImportNamespaceSpecifier',
					local: syntheticId(hoistedName),
					metadata: { path: [] },
				},
			],
			source: withLocation({ ...statement.source }, statement.source),
			importKind: statement.importKind,
		},
		statement,
	);

	const aliases = [];
	const valueSpecifiers = [];
	for (const specifier of statement.specifiers) {
		const typeOnly = statement.importKind === 'type' || specifier.importKind === 'type';
		if (
			specifier.type === 'ImportNamespaceSpecifier' ||
			specifier.type === 'ImportDefaultSpecifier'
		) {
			const isDefault = specifier.type === 'ImportDefaultSpecifier';
			aliases.push(
				withLocation(
					{
						type: 'VariableDeclaration',
						kind: 'const',
						declarations: [
							withLocation(
								{
									type: 'VariableDeclarator',
									id: { ...specifier.local },
									init: isDefault
										? {
												type: 'MemberExpression',
												object: syntheticId(hoistedName),
												property: syntheticId('default'),
												computed: false,
												optional: false,
												metadata: { path: [] },
											}
										: syntheticId(hoistedName),
								},
								specifier,
							),
						],
					},
					specifier,
				),
			);
		} else if (typeOnly) {
			aliases.push(buildTypeAlias(specifier, () => syntheticId(hoistedName)));
		} else {
			valueSpecifiers.push(specifier);
		}
	}
	if (valueSpecifiers.length > 0) {
		aliases.push(buildDestructure(valueSpecifiers, () => syntheticId(hoistedName), statement));
	}
	return { hoisted, aliases };
}

/**
 * Replace the server block with hoisted imports plus a namespace-valued
 * binding the checker can see through.
 */
function lowerDeclaration(declaration, outsideNames) {
	const hoistedImports = [];
	const aliases = [];
	const rest = [];
	let hoistedIndex = 0;

	for (const statement of declaration.body?.body ?? []) {
		if (statement.type !== 'ImportDeclaration') {
			rest.push(statement);
			continue;
		}
		const collides = (statement.specifiers ?? []).some((specifier) =>
			outsideNames.has(specifier.local?.name),
		);
		if (!collides) {
			// Authored node, hoisted as-is — its locations map 1:1.
			hoistedImports.push(statement);
			continue;
		}
		const lowered = lowerCollidingImport(statement, HOISTED_IMPORT_PREFIX + hoistedIndex++);
		hoistedImports.push(lowered.hoisted);
		aliases.push(...lowered.aliases);
	}

	const namespace = {
		...declaration,
		// Always an Identifier (the authored id could be a string Literal),
		// carrying the authored id's location.
		id: withLocation(syntheticId(SERVER_MODULE_NAMESPACE), declaration.id),
		metadata: { ...declaration.metadata, module_keyword: 'namespace' },
		body: { ...declaration.body, body: [...aliases, ...rest] },
	};
	return [...hoistedImports, namespace];
}

/**
 * Rewrite one `import { x, type T } from 'server'` statement into bindings
 * on the lowered namespace. Value specifiers become one `const { x } =
 * __octane_server_module;` destructure; type-only specifiers become `type
 * T = __octane_server_module.T;` aliases. A specifier-less server import
 * binds nothing and is dropped (compile.js accepts and elides it), while
 * non-named specifiers (default / namespace imports) are a hard compile
 * error in the dialect — those statements stay verbatim so the editor's
 * TS2307 mirrors the build error.
 */
function lowerServerImport(statement) {
	const specifiers = statement.specifiers ?? [];
	if (specifiers.length === 0) return [];
	if (specifiers.some((s) => s.type !== 'ImportSpecifier')) {
		return [statement];
	}
	const typeSpecifiers = [];
	const valueSpecifiers = [];
	for (const specifier of specifiers) {
		if (statement.importKind === 'type' || specifier.importKind === 'type') {
			typeSpecifiers.push(specifier);
		} else {
			valueSpecifiers.push(specifier);
		}
	}

	// Each reference to the namespace carries the authored `'server'` source
	// span, so hover / go-to-def on the import's module name resolves to the
	// lowered block.
	const namespaceRef = () => withLocation(syntheticId(SERVER_MODULE_NAMESPACE), statement.source);
	const lowered = [];
	if (valueSpecifiers.length > 0) {
		lowered.push(buildDestructure(valueSpecifiers, namespaceRef, statement));
	}
	for (const specifier of typeSpecifiers) {
		lowered.push(buildTypeAlias(specifier, namespaceRef));
	}
	return lowered;
}

/**
 * Lower the `module server` dialect in a parsed program to plain TS the
 * type checker accepts. Returns the ORIGINAL ast unchanged (same object)
 * when the file has no server block; otherwise returns a new Program that
 * shares every untouched statement with the original parse.
 *
 * Only the FIRST server declaration is lowered — a second one is a hard
 * compile error, and leaving it verbatim surfaces a TS error in the same
 * place. Likewise `import … from 'server'` without any server block stays
 * verbatim (TS2307), mirroring compile.js's error.
 */
export function lowerServerModuleForTypes(ast) {
	const body = ast?.body;
	if (!Array.isArray(body)) return ast;
	const declaration = body.find(isServerModuleDeclaration);
	// A body-less `module server;` only occurs mid-edit / in loose parses;
	// leave it for TS to flag rather than fabricating an empty namespace.
	if (declaration === undefined || !Array.isArray(declaration.body?.body)) return ast;

	const outsideNames = collectOutsideIdentifierNames(ast, declaration);
	// The lowered namespace claims the authored block name at module scope; a
	// block import local named `server` must be aliased out of its way.
	outsideNames.add(SERVER_MODULE_NAMESPACE);
	const newBody = [];
	for (const statement of body) {
		if (statement === declaration) {
			newBody.push(...lowerDeclaration(declaration, outsideNames));
		} else if (isServerImport(statement)) {
			newBody.push(...lowerServerImport(statement));
		} else {
			newBody.push(statement);
		}
	}
	return { ...ast, body: newBody };
}
