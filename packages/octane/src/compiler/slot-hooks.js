// Lightweight, surgical hook-slotting for plain `.ts`/`.js` modules.
//
// The full `compile()` path re-emits the whole module (esrap), which can't print
// arbitrary TypeScript (index signatures, generic call signatures, type aliases) —
// so it's reserved for `.tsrx`/`.tsx`. A custom hook can also live in a plain
// module, though, and its base octane hooks still need a per-call-site slot key
// or they throw "useState was called without a hook slot" at runtime.
//
// This pass parses the module (for byte offsets), finds ONLY octane BASE hook
// calls, and splices a trailing compiler slot into each — every other byte (all the
// TS the printer can't handle) passes through verbatim. It does NOT wrap custom
// hooks in `withSlot` (that's done by the `.tsrx`/`.tsx` CALLER, and wrapping a
// hand-written binding that already forwards a slot would double-slot it). In
// production it reserves a collision-free runtime range because these arbitrary
// helpers can execute in a Scope alongside code from any other source module.

import { parseModule } from '@tsrx/core';
import { HOOK_NAMES, hookSlotHash } from './compile.js';
import { analyzeHookDependencies } from './hook-deps.js';
import {
	analyzeCausalStateDiagnostics,
	assertNoCausalStateErrors,
} from './causal-state-diagnostics.js';
import {
	analyzeCausalComponentAliases,
	assertNoUnresolvedCausalComponentAliases,
} from './causal-state-aliases.js';

// Build a cheap import-presence gate. Precise call identity is annotated by the
// lexical scope analysis in analyzeHookDependencies below; this gate only avoids
// doing the surgical edit walk for modules that cannot contain an Octane hook.
function octaneHookLocals(ast) {
	const locals = new Map();
	let importsHook = false;
	let hasOctaneImport = false;
	for (const node of ast.body || []) {
		if (node.type !== 'ImportDeclaration' || node.source?.value !== 'octane') continue;
		hasOctaneImport = true;
		for (const sp of node.specifiers || []) {
			if (sp.type === 'ImportNamespaceSpecifier' && sp.local?.name) {
				locals.set(sp.local.name, '*');
				importsHook = true;
				continue;
			}
			if (sp.type !== 'ImportSpecifier') continue;
			const imported = sp.imported?.name;
			const local = sp.local?.name;
			if (!imported || !local) continue;
			locals.set(local, imported);
			if (HOOK_NAMES.has(imported) || imported === 'use') importsHook = true;
		}
	}
	return { locals, importsHook, hasOctaneImport };
}

// Find only the disposable top-level root shape used by production entries:
// `createRoot(target).render(ImportedComponent[, props]);`. Keeping the matcher
// this narrow means the specialized root can never escape and receive a later
// unknown render. The bundler adapter resolves and loads each returned import;
// this pass never guesses what a request points at from the importer's path.
function collectVoidRootCandidates(ast) {
	const createRootLocals = new Set();
	const componentImports = new Map();
	for (const node of ast.body || []) {
		if (node.type !== 'ImportDeclaration' || typeof node.source?.value !== 'string') continue;
		const request = node.source.value;
		for (const sp of node.specifiers || []) {
			if (request === 'octane' && sp.type === 'ImportSpecifier') {
				const imported = sp.imported?.name ?? sp.imported?.value;
				if (imported === 'createRoot' && sp.local?.name) createRootLocals.add(sp.local.name);
				continue;
			}
			if (!request.startsWith('./') && !request.startsWith('../')) continue;
			if (sp.type === 'ImportDefaultSpecifier' && sp.local?.name) {
				componentImports.set(sp.local.name, { request, imported: 'default' });
			} else if (sp.type === 'ImportSpecifier' && sp.local?.name) {
				const imported = sp.imported?.name ?? sp.imported?.value;
				if (typeof imported === 'string') {
					componentImports.set(sp.local.name, { request, imported });
				}
			}
		}
	}
	if (createRootLocals.size === 0 || componentImports.size === 0) return [];

	const candidates = [];
	for (const statement of ast.body || []) {
		if (statement.type !== 'ExpressionStatement') continue;
		const renderCall = statement.expression;
		if (
			renderCall?.type !== 'CallExpression' ||
			renderCall.optional === true ||
			renderCall.arguments.length < 1 ||
			renderCall.arguments.length > 2
		)
			continue;
		const member = renderCall.callee;
		if (
			member?.type !== 'MemberExpression' ||
			member.computed === true ||
			member.optional === true ||
			member.property?.type !== 'Identifier' ||
			member.property.name !== 'render'
		)
			continue;
		const rootCall = member.object;
		if (
			rootCall?.type !== 'CallExpression' ||
			rootCall.optional === true ||
			rootCall.callee?.type !== 'Identifier' ||
			!createRootLocals.has(rootCall.callee.name)
		)
			continue;
		const component = renderCall.arguments[0];
		if (component?.type !== 'Identifier') continue;
		const imported = componentImports.get(component.name);
		if (imported === undefined) continue;
		candidates.push({
			...imported,
			start: rootCall.callee.start,
			end: rootCall.callee.end,
		});
	}
	return candidates;
}

/**
 * Return the unique component imports used by an exactly disposable root.
 * Adapters use this before transformation so resolution and module loading can
 * establish the imported export's actual compiled contract.
 */
export function findVoidRootImports(source, id) {
	let ast;
	try {
		ast = parseModule(source, id);
	} catch {
		return [];
	}
	const unique = new Map();
	for (const { request, imported } of collectVoidRootCandidates(ast)) {
		unique.set(`${request}\0${imported}`, { request, imported });
	}
	return [...unique.values()];
}

// Cross-module component calls need the same definition-site proof as a
// disposable plain-JS root. Discover only bare JSX tags backed by relative
// default/named imports; member/dynamic tags and package/virtual resolution stay
// conservative. The full compiler validates the local binding again before it
// consumes the proof, so a nested lexical shadow cannot change the call ABI.
function collectVoidJsxImportCandidates(ast) {
	const imports = new Map();
	for (const node of ast.body || []) {
		if (
			node.type !== 'ImportDeclaration' ||
			typeof node.source?.value !== 'string' ||
			(!node.source.value.startsWith('./') && !node.source.value.startsWith('../')) ||
			node.importKind === 'type'
		)
			continue;
		for (const specifier of node.specifiers || []) {
			if (specifier.importKind === 'type' || !specifier.local?.name) continue;
			if (specifier.type === 'ImportDefaultSpecifier') {
				imports.set(specifier.local.name, {
					request: node.source.value,
					imported: 'default',
				});
			} else if (specifier.type === 'ImportSpecifier') {
				const imported = specifier.imported?.name ?? specifier.imported?.value;
				if (typeof imported === 'string') {
					imports.set(specifier.local.name, { request: node.source.value, imported });
				}
			}
		}
	}
	if (imports.size === 0) return [];

	const candidates = [];
	const seen = new WeakSet();
	const walk = (value) => {
		if (!value || typeof value !== 'object') return;
		if (Array.isArray(value)) {
			for (const child of value) walk(child);
			return;
		}
		if (seen.has(value)) return;
		seen.add(value);
		if (value.type === 'JSXElement' || value.type === 'Element') {
			const tag = value.openingElement?.name || value.id || value.name;
			if ((tag?.type === 'Identifier' || tag?.type === 'JSXIdentifier') && imports.has(tag.name)) {
				candidates.push(imports.get(tag.name));
			}
		}
		for (const key in value) {
			if (key === 'loc' || key === 'start' || key === 'end' || key === 'parent') continue;
			walk(value[key]);
		}
	};
	walk(ast.body || []);
	return candidates;
}

/**
 * Return every imported component contract a production transform can use:
 * disposable plain-JS roots plus component tags in compiled JSX output.
 */
export function findVoidComponentImports(source, id) {
	let ast;
	try {
		ast = parseModule(source, id);
	} catch {
		return [];
	}
	const unique = new Map();
	for (const candidate of [
		...collectVoidRootCandidates(ast),
		...collectVoidJsxImportCandidates(ast),
	]) {
		const { request, imported } = candidate;
		unique.set(`${request}\0${imported}`, { request, imported });
	}
	return [...unique.values()];
}

function collectVoidRootEdits(ast, st, isVoidComponentImport) {
	if (typeof isVoidComponentImport !== 'function') return;
	for (const candidate of collectVoidRootCandidates(ast)) {
		if (!isVoidComponentImport(candidate.request, candidate.imported)) continue;
		if (st.voidRootName === null) st.voidRootName = allocSlotName(st, '_$createVoidRoot');
		st.edits.push({
			pos: candidate.start,
			end: candidate.end,
			text: st.voidRootName,
		});
	}
}

const STATE_GETTER_HELPERS = {
	useState: '__useStateWithGetter',
	useReducer: '__useReducerWithGetter',
};

const CAUSAL_STATE_MODEL_HOOKS = new Set([
	'useState',
	'useReducer',
	'useEffect',
	'useLayoutEffect',
	'useInsertionEffect',
	'useImperativeHandle',
	'useMemo',
	'useActionState',
	'useOptimistic',
]);

function effectiveStateModel(options) {
	const stateModel = options?.stateModel ?? 'permissive';
	if (stateModel !== 'causal' && stateModel !== 'permissive') {
		throw new Error(
			`Unknown state model ${JSON.stringify(stateModel)} — expected 'causal' or 'permissive'.`,
		);
	}
	return stateModel;
}

function causalStateArgument(stateModel, hook) {
	return stateModel === 'causal' && CAUSAL_STATE_MODEL_HOOKS.has(hook) ? ', 1' : '';
}

function ensureCausalStateMarker(st) {
	if (st.causalStateMarkerName === null) {
		st.causalStateMarkerName = allocSlotName(st, '_$markStateModel');
	}
	return st.causalStateMarkerName;
}

function ensureCausalStateMethodsMarker(st) {
	if (st.causalStateMethodsMarkerName === null) {
		st.causalStateMethodsMarkerName = allocSlotName(st, '_$markStateModelMethods');
	}
	return st.causalStateMethodsMarkerName;
}

function causalFunctionProducesJsx(node) {
	if (!isFunctionNode(node)) return false;
	if (node.body?.type === 'JSXCodeBlock') return true;
	const containsOutput = (value, root = true) => {
		if (!value || typeof value !== 'object') return false;
		if (Array.isArray(value)) return value.some((child) => containsOutput(child, false));
		if (
			value.type === 'JSXElement' ||
			value.type === 'JSXFragment' ||
			value.type === 'Element' ||
			value.type === 'Fragment'
		) {
			return true;
		}
		if (!root && isFunctionNode(value)) return false;
		for (const key in value) {
			if (key === 'type' || key === 'loc' || key === 'start' || key === 'end' || key === 'metadata')
				continue;
			if (containsOutput(value[key], false)) return true;
		}
		return false;
	};
	if (node.type === 'ArrowFunctionExpression' && node.expression) {
		return containsOutput(node.body, false);
	}
	if (node.body?.type !== 'BlockStatement') return false;
	let found = false;
	const visit = (value) => {
		if (found || !value || typeof value !== 'object') return;
		if (Array.isArray(value)) {
			for (const child of value) visit(child);
			return;
		}
		if (value !== node.body && isFunctionNode(value)) return;
		if (value.type === 'ReturnStatement' && containsOutput(value.argument, false)) {
			found = true;
			return;
		}
		for (const key in value) {
			if (key === 'type' || key === 'loc' || key === 'start' || key === 'end' || key === 'metadata')
				continue;
			visit(value[key]);
		}
	};
	visit(node.body);
	return found;
}

function causalFunctionReturnsFunction(node) {
	const returnedFunction = (value) => {
		const expression = unwrapParallelUseValue(value);
		if (!expression) return false;
		if (expression.type === 'FunctionExpression' || expression.type === 'ArrowFunctionExpression') {
			return true;
		}
		if (expression.type === 'ConditionalExpression') {
			return returnedFunction(expression.consequent) || returnedFunction(expression.alternate);
		}
		if (expression.type === 'LogicalExpression') {
			return returnedFunction(expression.left) || returnedFunction(expression.right);
		}
		if (expression.type === 'SequenceExpression') {
			return returnedFunction(expression.expressions?.at(-1));
		}
		return false;
	};
	if (node.type === 'ArrowFunctionExpression' && node.expression) {
		return returnedFunction(node.body);
	}
	if (node.body?.type !== 'BlockStatement') return false;
	let found = false;
	const visit = (value) => {
		if (found || !value || typeof value !== 'object') return;
		if (Array.isArray(value)) {
			for (const child of value) visit(child);
			return;
		}
		if (value !== node.body && isFunctionNode(value)) return;
		if (value.type === 'ReturnStatement' && returnedFunction(value.argument)) {
			found = true;
			return;
		}
		for (const key in value) {
			if (key === 'type' || key === 'loc' || key === 'start' || key === 'end') continue;
			visit(value[key]);
		}
	};
	visit(node.body);
	return found;
}

function causalDefinitionName(name) {
	return (
		typeof name === 'string' &&
		(/^use[A-Z]/.test(name) || (/^[A-Z]/.test(name) && !name.includes('-')))
	);
}

function staticDefinitionPropertyName(property) {
	if (!property || property.type === 'SpreadElement') return null;
	if (
		!property.computed &&
		(property.key?.type === 'Identifier' || property.key?.type === 'PrivateIdentifier')
	) {
		return property.key.name;
	}
	if (
		property.key?.type === 'Literal' &&
		(typeof property.key.value === 'string' || typeof property.key.value === 'number')
	) {
		return String(property.key.value);
	}
	return null;
}

function unsupportedCausalClassHook(st, node, name) {
	const error = new Error(
		`${st.filename}:${node.loc?.start?.line ?? 1}:${(node.loc?.start?.column ?? 0) + 1} ` +
			`class method ${JSON.stringify(name)} is a custom-hook definition, but causal state provenance cannot yet be attached to prototype methods without changing their descriptor identity. Move the hook to a module function or object-function property, or keep the owning dependency at an explicitly approved permissive boundary while it migrates.`,
	);
	error.code = 'OCTANE_CAUSAL_CLASS_HOOK_UNSUPPORTED';
	error.filename = st.filename;
	throw error;
}

function unsupportedCausalObjectMethod(st, node, name, reason) {
	const error = new Error(
		`${st.filename}:${node.loc?.start?.line ?? 1}:${(node.loc?.start?.column ?? 0) + 1} ` +
			`Octane cannot preserve causal provenance for object method ${JSON.stringify(name ?? '<computed>')} because ${reason}. Use a static key whose final own definition is unambiguous, move the definition to a module function, or keep the owning dependency at an explicitly approved permissive boundary while it migrates.`,
	);
	error.code = 'OCTANE_CAUSAL_OBJECT_METHOD_UNSUPPORTED';
	error.filename = st.filename;
	throw error;
}

function collectCausalDefinitionEdits(ast, st) {
	const exportedNames = new Set();
	for (const statement of ast.body || []) {
		if (statement.type !== 'ExportNamedDeclaration') continue;
		const declaration = statement.declaration;
		if (declaration?.type === 'VariableDeclaration') {
			for (const item of declaration.declarations || []) {
				if (item.id?.type === 'Identifier' && causalDefinitionName(item.id.name)) {
					exportedNames.add(item.id.name);
				}
			}
		}
		for (const specifier of statement.specifiers || []) {
			const exported = specifier.exported?.name ?? specifier.exported?.value;
			if (
				specifier.local?.name &&
				(exported === 'default' || (typeof exported === 'string' && /^[A-Z]/.test(exported)))
			) {
				exportedNames.add(specifier.local.name);
			}
		}
	}

	const wrapped = new WeakSet();
	const causalObjectMethods = new WeakMap();
	const shouldMark = (node, hint) => {
		const name = hint?.name ?? node.id?.name;
		if (typeof name === 'string' && /^use[A-Z]/.test(name)) return true;
		if (hint?.directlyReturnsFunction === true || causalFunctionReturnsFunction(node)) return false;
		return (
			causalFunctionProducesJsx(node) ||
			st.causalStateForcedFunctions?.has(node) === true ||
			hint?.force === true ||
			causalDefinitionName(name)
		);
	};
	const wrapExpression = (node, hint) => {
		if (wrapped.has(node)) return;
		wrapped.add(node);
		const marker = ensureCausalStateMarker(st);
		st.edits.push({ pos: node.start, text: `/* @__PURE__ */ ${marker}(` });
		const nameHint =
			node.id == null && typeof hint?.inferredName === 'string'
				? `, ${JSON.stringify(hint.inferredName)}`
				: '';
		st.edits.push({ pos: node.end, text: `, 1${nameHint})` });
	};
	const markDeclaration = (node, name, registrations) => {
		const marker = ensureCausalStateMarker(st);
		const text = `${name} = /* @__PURE__ */ ${marker}(${name}, 1);`;
		if (registrations !== null) registrations.push(text);
		else st.edits.push({ pos: node.end, text: `; ${text}` });
	};
	const markObjectMethod = (property) => {
		if (property.kind !== 'init') return;
		const name = staticDefinitionPropertyName(property);
		if (name === null) {
			unsupportedCausalObjectMethod(st, property, name, 'its computed key is not statically known');
		}
		causalObjectMethods.set(property, name);
		wrapped.add(property.value);
	};

	const visitStatementList = (statements, fallback) => {
		const registrations = [];
		for (const statement of statements || []) visit(statement, null, null, registrations);
		if (registrations.length === 0) return;
		let position = fallback;
		for (const statement of statements || []) {
			const directive =
				statement.directive != null ||
				(statement.type === 'ExpressionStatement' &&
					statement.expression?.type === 'Literal' &&
					typeof statement.expression.value === 'string');
			if (statement.type === 'ImportDeclaration' || directive) continue;
			position = statement.start;
			break;
		}
		st.edits.push({ pos: position, text: registrations.join(' ') + ' ' });
	};

	const visit = (node, hint = null, property = null, registrations = null) => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		if (node.type === 'Program') {
			visitStatementList(node.body || [], node.end);
			return;
		}
		if (node.type === 'BlockStatement' || node.type === 'JSXCodeBlock') {
			visitStatementList(node.body || [], Math.max(node.start, node.end - 1));
			if (node.render) visit(node.render);
			return;
		}
		if (node.type === 'ExportNamedDeclaration') {
			visit(node.declaration, null, null, registrations);
			return;
		}
		if (node.type === 'ExportDefaultDeclaration') {
			visit(
				node.declaration,
				{
					name: node.declaration?.id?.name ?? 'default',
					inferredName: 'default',
					force: true,
				},
				null,
				registrations,
			);
			return;
		}
		if (node.type === 'VariableDeclaration') {
			for (const declaration of node.declarations || []) {
				const name = declaration.id?.type === 'Identifier' ? declaration.id.name : null;
				visit(declaration.init, {
					name,
					inferredName: name,
					force: name !== null && exportedNames.has(name),
				});
			}
			return;
		}
		if (node.type === 'FunctionDeclaration') {
			for (const parameter of node.params || []) visit(parameter);
			visit(node.body);
			if (!node.body || !shouldMark(node, hint)) return;
			if (node.id?.name) markDeclaration(node, node.id.name, registrations);
			else wrapExpression(node, hint);
			return;
		}
		if (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
			const directlyReturnsFunction = causalFunctionReturnsFunction(node);
			for (const parameter of node.params || []) visit(parameter);
			visit(node.body);
			// Accessors and class methods require their function node in-place for valid
			// syntax. Nested callable values were still visited above; class custom-hook
			// methods are rejected explicitly by the MethodDefinition branch below.
			if (hint?.suppressSelf === true) return;
			if (!shouldMark(node, { ...hint, directlyReturnsFunction })) return;
			if (property?.method === true) {
				markObjectMethod(property);
			} else wrapExpression(node, hint);
			return;
		}
		if (node.type === 'ObjectExpression') {
			for (const property of node.properties || []) visit(property, hint);
			const finalKeys = [];
			const seenStaticKeys = new Set();
			let mayOverrideEarlier = false;
			for (let index = (node.properties?.length ?? 0) - 1; index >= 0; index--) {
				const property = node.properties[index];
				const key = staticDefinitionPropertyName(property);
				const markedKey = causalObjectMethods.get(property);
				if (markedKey !== undefined && !seenStaticKeys.has(markedKey)) {
					if (mayOverrideEarlier) {
						unsupportedCausalObjectMethod(
							st,
							property,
							markedKey,
							'a later spread or dynamic property may replace it',
						);
					}
					finalKeys.push(markedKey);
				}
				if (key === null) mayOverrideEarlier = true;
				else seenStaticKeys.add(key);
			}
			if (finalKeys.length !== 0) {
				const marker = ensureCausalStateMethodsMarker(st);
				st.edits.push({ pos: node.start, text: `/* @__PURE__ */ ${marker}(` });
				st.edits.push({
					pos: node.end,
					text: `, 1, ${finalKeys.reverse().map(JSON.stringify).join(', ')})`,
				});
			}
			return;
		}
		if (node.type === 'Property') {
			if (node.computed) visit(node.key);
			const name = staticDefinitionPropertyName(node);
			visit(
				node.value,
				node.kind === 'init' ? { name, inferredName: name } : { suppressSelf: true },
				node,
			);
			return;
		}
		if (node.type === 'MethodDefinition' || node.type === 'ClassMethod') {
			if (node.computed) visit(node.key);
			const name = staticDefinitionPropertyName(node);
			if (node.kind !== 'get' && node.kind !== 'set' && /^use[A-Z]/.test(name ?? '')) {
				unsupportedCausalClassHook(st, node, name);
			}
			visit(node.value, { suppressSelf: true });
			return;
		}
		if (node.type === 'PropertyDefinition' || node.type === 'ClassProperty') {
			if (node.computed) visit(node.key);
			const name = staticDefinitionPropertyName(node);
			visit(node.value, { name, inferredName: name });
			return;
		}
		if (node.type === 'ConditionalExpression') {
			visit(node.test);
			const branchHint = hint === null ? null : { ...hint, inferredName: undefined };
			visit(node.consequent, branchHint);
			visit(node.alternate, branchHint);
			return;
		}
		if (node.type === 'LogicalExpression') {
			const branchHint = hint === null ? null : { ...hint, inferredName: undefined };
			visit(node.left, branchHint);
			visit(node.right, branchHint);
			return;
		}
		if (node.type === 'SequenceExpression') {
			const finalHint = hint === null ? null : { ...hint, inferredName: undefined };
			for (let index = 0; index < (node.expressions?.length ?? 0); index++) {
				visit(node.expressions[index], index === node.expressions.length - 1 ? finalHint : null);
			}
			return;
		}
		if (
			node.type === 'TSAsExpression' ||
			node.type === 'TSTypeAssertion' ||
			node.type === 'TSNonNullExpression' ||
			node.type === 'TSSatisfiesExpression' ||
			node.type === 'ParenthesizedExpression' ||
			node.type === 'ChainExpression'
		) {
			visit(node.expression, hint);
			return;
		}
		if (node.type === 'CallExpression') {
			visit(node.callee);
			const renderEntry =
				node.callee?.type === 'MemberExpression' &&
				!node.callee.computed &&
				node.callee.property?.type === 'Identifier' &&
				node.callee.property.name === 'render';
			for (let index = 0; index < (node.arguments?.length ?? 0); index++) {
				visit(node.arguments[index], renderEntry && index === 0 ? { force: true } : null);
			}
			return;
		}
		for (const key in node) {
			if (key === 'type' || key === 'loc' || key === 'start' || key === 'end') continue;
			visit(node[key]);
		}
	};
	visit(ast);
}

function collectIdentifierNames(root) {
	const names = new Set();
	const walk = (node) => {
		if (node == null || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) walk(child);
			return;
		}
		if (node.type === 'Identifier' && typeof node.name === 'string') names.add(node.name);
		for (const key in node) {
			if (key === 'type' || key === 'loc' || key === 'start' || key === 'end') continue;
			walk(node[key]);
		}
	};
	walk(root);
	return names;
}

function allocSlotName(st, preferred) {
	let name = preferred;
	while (st.usedNames.has(name)) name += '$';
	st.usedNames.add(name);
	return name;
}

function arrayPatternObservesStateGetter(pattern) {
	const elements = pattern.elements || [];
	if (elements[2] != null) return true;
	for (let i = 0; i <= 2 && i < elements.length; i++) {
		if (elements[i]?.type === 'RestElement') return true;
	}
	return false;
}

function isTransparentStateTupleWrapper(node, child) {
	return (
		(node?.type === 'TSAsExpression' ||
			node?.type === 'TSTypeAssertion' ||
			node?.type === 'TSNonNullExpression' ||
			node?.type === 'ParenthesizedExpression' ||
			node?.type === 'ChainExpression') &&
		node.expression === child
	);
}

const PARALLEL_USE_TS_WRAPPERS = new Set([
	'TSAsExpression',
	'TSTypeAssertion',
	'TSNonNullExpression',
	'TSSatisfiesExpression',
	'ParenthesizedExpression',
	'ChainExpression',
]);
function isFunctionNode(node) {
	return (
		node?.type === 'FunctionDeclaration' ||
		node?.type === 'FunctionExpression' ||
		node?.type === 'ArrowFunctionExpression'
	);
}

function unwrapParallelUseValue(node) {
	while (node && PARALLEL_USE_TS_WRAPPERS.has(node.type)) node = node.expression;
	return node;
}

function collectPatternNames(pattern, into) {
	if (!pattern) return;
	switch (pattern.type) {
		case 'Identifier':
			into.add(pattern.name);
			return;
		case 'ObjectPattern':
			for (const property of pattern.properties || []) {
				collectPatternNames(
					property.type === 'RestElement' ? property.argument : property.value,
					into,
				);
			}
			return;
		case 'ArrayPattern':
			for (const element of pattern.elements || []) collectPatternNames(element, into);
			return;
		case 'AssignmentPattern':
			collectPatternNames(pattern.left, into);
			return;
		case 'RestElement':
			collectPatternNames(pattern.argument, into);
	}
}

function isTrivialParallelUseArg(node) {
	node = unwrapParallelUseValue(node);
	if (!node) return true;
	if (node.type === 'Identifier' || node.type === 'Literal') return true;
	return node.type === 'MemberExpression' && !node.computed && isTrivialParallelUseArg(node.object);
}

function isHookShapedCall(node) {
	if (typeof node?._octaneImportedHook === 'string') return true;
	const callee = unwrapParallelUseValue(node?.callee);
	if (callee?.type === 'Identifier') {
		return callee.name === 'use' || /^use[A-Z]/.test(callee.name);
	}
	return (
		callee?.type === 'MemberExpression' &&
		!callee.computed &&
		callee.property?.type === 'Identifier' &&
		(callee.property.name === 'use' || /^use[A-Z]/.test(callee.property.name))
	);
}

// A generated memo callback cannot directly contain await/yield, and replacing
// an argument that contains any hook would either overlap a slotted hook's
// surgical edit or skip that hook on memo hits. Both shapes stay on the
// ordinary serial use() path.
function canRewriteParallelUseArg(root) {
	let safe = true;
	function visit(node, nestedFunction) {
		if (!safe || !node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) visit(child, nestedFunction);
			return;
		}
		if (!nestedFunction && (node.type === 'AwaitExpression' || node.type === 'YieldExpression')) {
			safe = false;
			return;
		}
		if (node.type === 'CallExpression' && isHookShapedCall(node)) {
			safe = false;
			return;
		}
		const childNested = nestedFunction || (node !== root && isFunctionNode(node));
		for (const key in node) {
			if (
				key === 'type' ||
				key === 'start' ||
				key === 'end' ||
				key === 'loc' ||
				key === 'typeAnnotation' ||
				key === 'returnType' ||
				key === 'typeParameters' ||
				key.startsWith('_octane')
			) {
				continue;
			}
			visit(node[key], childNested);
		}
	}
	visit(root, false);
	return safe;
}

// Dependency paths mirror the full compiler's one-level member policy. The
// returned nodes retain their original byte offsets so arbitrary TS remains
// printable without asking the full-module printer to understand it.
function collectParallelUseDependencies(root, source) {
	const dependencies = [];
	const seen = new Set();

	function add(node, rootName) {
		const text = source.slice(node.start, node.end);
		const key = `${rootName}\0${text}`;
		if (seen.has(key)) return;
		seen.add(key);
		dependencies.push({ node, root: rootName, text });
	}

	function createLocalScope(parent, kind) {
		return { parent, kind, names: new Set() };
	}

	function isLocallyBound(scope, name) {
		for (let current = scope; current !== null; current = current.parent) {
			if (current.names.has(name)) return true;
		}
		return false;
	}

	function nearestFunctionScope(scope) {
		let current = scope;
		while (current?.parent !== null && current?.kind !== 'function') current = current.parent;
		return current;
	}

	function predeclareStatements(statements, blockScope) {
		for (const original of statements || []) {
			const statement =
				original.type === 'ExportNamedDeclaration' || original.type === 'ExportDefaultDeclaration'
					? original.declaration
					: original;
			if (!statement) continue;
			if (statement.type === 'VariableDeclaration') {
				const target = statement.kind === 'var' ? nearestFunctionScope(blockScope) : blockScope;
				for (const declaration of statement.declarations || []) {
					collectPatternNames(declaration.id, target.names);
				}
			} else if (
				(statement.type === 'FunctionDeclaration' || statement.type === 'ClassDeclaration') &&
				statement.id
			) {
				collectPatternNames(statement.id, blockScope.names);
			}
		}
	}

	function collectHoistedVars(node, functionScope, isRoot = true) {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) collectHoistedVars(child, functionScope, false);
			return;
		}
		if (
			!isRoot &&
			(isFunctionNode(node) || node.type === 'ClassDeclaration' || node.type === 'ClassExpression')
		) {
			return;
		}
		if (node.type === 'VariableDeclaration' && node.kind === 'var') {
			for (const declaration of node.declarations || []) {
				collectPatternNames(declaration.id, functionScope.names);
			}
		}
		for (const key in node) {
			if (
				key === 'type' ||
				key === 'start' ||
				key === 'end' ||
				key === 'loc' ||
				key === 'typeAnnotation' ||
				key === 'returnType' ||
				key === 'typeParameters' ||
				key.startsWith('_octane')
			) {
				continue;
			}
			collectHoistedVars(node[key], functionScope, false);
		}
	}

	function visitPatternExpressions(pattern, scope) {
		if (!pattern) return;
		if (pattern.type === 'AssignmentPattern') {
			visitPatternExpressions(pattern.left, scope);
			visit(pattern.right, scope);
		} else if (pattern.type === 'ObjectPattern') {
			for (const property of pattern.properties || []) {
				if (property.computed) visit(property.key, scope);
				visitPatternExpressions(
					property.type === 'RestElement' ? property.argument : property.value,
					scope,
				);
			}
		} else if (pattern.type === 'ArrayPattern') {
			for (const element of pattern.elements || []) visitPatternExpressions(element, scope);
		} else if (pattern.type === 'RestElement') {
			visitPatternExpressions(pattern.argument, scope);
		}
	}

	function visitBlock(node, parentScope) {
		const blockScope = createLocalScope(parentScope, 'block');
		predeclareStatements(node.body, blockScope);
		for (const statement of node.body || []) visit(statement, blockScope);
	}

	function visitFunction(node, parentScope) {
		const functionScope = createLocalScope(parentScope, 'function');
		if (node.id) collectPatternNames(node.id, functionScope.names);
		if (node.type !== 'ArrowFunctionExpression') functionScope.names.add('arguments');
		for (const param of node.params || []) collectPatternNames(param, functionScope.names);
		collectHoistedVars(node.body, functionScope);
		for (const param of node.params || []) visitPatternExpressions(param, functionScope);
		if (node.body?.type === 'BlockStatement') visitBlock(node.body, functionScope);
		else visit(node.body, functionScope);
	}

	function visit(node, scope) {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) visit(child, scope);
			return;
		}
		if (PARALLEL_USE_TS_WRAPPERS.has(node.type)) {
			visit(node.expression, scope);
			return;
		}
		if (node.type?.startsWith('TS')) return;
		switch (node.type) {
			case 'Identifier':
				if (!isLocallyBound(scope, node.name)) add(node, node.name);
				return;
			case 'Literal':
			case 'ThisExpression':
			case 'Super':
			case 'MetaProperty':
			case 'PrivateIdentifier':
				return;
			case 'MemberExpression': {
				const object = unwrapParallelUseValue(node.object);
				if (
					!node.computed &&
					object?.type === 'Identifier' &&
					!isLocallyBound(scope, object.name)
				) {
					add(node, object.name);
					return;
				}
				visit(node.object, scope);
				if (node.computed) visit(node.property, scope);
				return;
			}
			case 'Property':
				if (node.computed) visit(node.key, scope);
				visit(node.value, scope);
				return;
			case 'VariableDeclarator':
				visitPatternExpressions(node.id, scope);
				visit(node.init, scope);
				return;
			case 'CatchClause': {
				const catchScope = createLocalScope(scope, 'block');
				collectPatternNames(node.param, catchScope.names);
				visitPatternExpressions(node.param, catchScope);
				visit(node.body, catchScope);
				return;
			}
			case 'FunctionDeclaration':
			case 'FunctionExpression':
			case 'ArrowFunctionExpression':
				visitFunction(node, scope);
				return;
			case 'BlockStatement':
				visitBlock(node, scope);
				return;
			case 'StaticBlock': {
				const staticScope = createLocalScope(scope, 'function');
				collectHoistedVars(node, staticScope);
				visitBlock(node, staticScope);
				return;
			}
			case 'SwitchStatement': {
				visit(node.discriminant, scope);
				const switchScope = createLocalScope(scope, 'block');
				const statements = [];
				for (const switchCase of node.cases || []) {
					statements.push(...(switchCase.consequent || []));
				}
				predeclareStatements(statements, switchScope);
				for (const switchCase of node.cases || []) {
					visit(switchCase.test, switchScope);
					for (const statement of switchCase.consequent || []) visit(statement, switchScope);
				}
				return;
			}
			case 'ForStatement':
			case 'ForInStatement':
			case 'ForOfStatement': {
				const loopScope = createLocalScope(scope, 'block');
				const declaration = node.type === 'ForStatement' ? node.init : node.left;
				if (declaration?.type === 'VariableDeclaration' && declaration.kind !== 'var') {
					for (const item of declaration.declarations || []) {
						collectPatternNames(item.id, loopScope.names);
					}
				}
				if (node.type === 'ForStatement') {
					visit(node.init, loopScope);
					visit(node.test, loopScope);
					visit(node.update, loopScope);
				} else {
					visit(node.left, loopScope);
					visit(node.right, loopScope);
				}
				visit(node.body, loopScope);
				return;
			}
			case 'LabeledStatement':
				visit(node.body, scope);
				return;
			case 'BreakStatement':
			case 'ContinueStatement':
				return;
			case 'ClassDeclaration':
			case 'ClassExpression': {
				visit(node.superClass, scope);
				const classScope = createLocalScope(scope, 'block');
				if (node.id) collectPatternNames(node.id, classScope.names);
				visit(node.body, classScope);
				return;
			}
			case 'PropertyDefinition':
			case 'MethodDefinition':
				if (node.computed) visit(node.key, scope);
				visit(node.value, scope);
				return;
		}
		for (const key in node) {
			if (
				key === 'type' ||
				key === 'start' ||
				key === 'end' ||
				key === 'loc' ||
				key === 'typeAnnotation' ||
				key === 'returnType' ||
				key === 'typeParameters' ||
				key.startsWith('_octane')
			) {
				continue;
			}
			visit(node[key], scope);
		}
	}

	visit(root, null);
	return dependencies;
}

// Mark base-hook calls whose source tuple can observe index 2. The public base
// hooks stay on the physical two-item path; escaped or ambiguous tuples
// conservatively receive the getter-enabled shape.
function collectStateGetterCalls(ast) {
	const calls = new WeakSet();
	const ancestors = [];
	function walk(node) {
		if (node == null || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) walk(child);
			return;
		}
		if (node.type === 'CallExpression') {
			const imported = node._octaneImportedHook;
			if (STATE_GETTER_HELPERS[imported]) {
				let child = node;
				let i = ancestors.length - 1;
				while (i >= 0 && isTransparentStateTupleWrapper(ancestors[i], child)) {
					child = ancestors[i--];
				}
				const parent = i >= 0 ? ancestors[i] : null;
				let observed = true;
				if (parent?.type === 'VariableDeclarator' && parent.init === child) {
					observed =
						parent.id.type !== 'ArrayPattern' || arrayPatternObservesStateGetter(parent.id);
				} else if (parent?.type === 'AssignmentExpression' && parent.right === child) {
					observed =
						parent.left.type !== 'ArrayPattern' || arrayPatternObservesStateGetter(parent.left);
				} else if (parent?.type === 'MemberExpression' && parent.object === child) {
					const p = parent.property;
					const index = parent.computed && p?.type === 'Literal' ? Number(p.value) : NaN;
					observed = index !== 0 && index !== 1;
				} else if (parent?.type === 'ExpressionStatement') {
					observed = false;
				}
				if (observed) calls.add(node);
			}
		}
		ancestors.push(node);
		for (const key in node) {
			if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue;
			walk(node[key]);
		}
		ancestors.pop();
	}
	walk(ast);
	return calls;
}

// DFS in SOURCE ORDER, allocating a hook's slot id BEFORE descending into its args
// — identical pre-order to rewriteHookCalls, so a base hook nested as an argument
// (e.g. in a deps array) gets its own stable id. Collects insertion edits + the
// `const _h$N = Symbol.for(...)` declarations.
function hookOwner(node, name) {
	const loc = node?.loc?.start;
	return { name, line: loc?.line ?? 0, column: loc?.column ?? 0 };
}

function allocHookSymbol(st, owner, local, imported, node) {
	const id = st.nextId++;
	const sym = allocSlotName(st, `_h$${id}`);
	let symbolExpr;
	if (st.hmr) {
		const key = `octane:${st.filename}:${owner.name}.${local}#${id}`;
		symbolExpr = `Symbol.for(${JSON.stringify(key)})`;
	} else if (st.profile) {
		// The description must be UNIQUE and non-empty: the runtime composes
		// custom-hook slot paths from slot DESCRIPTIONS (resolveSlot) — a bare
		// Symbol() collapses those paths and collides state across call sites.
		// Short filename hash + index; no module path in the output (see
		// compile.js hookSlotHash for the full rationale).
		symbolExpr = `/* @__PURE__ */ Symbol(${JSON.stringify(`${st.hash}#${id}`)})`;
	} else {
		const numericExpr = id === 0 ? st.slotBaseName : `${st.slotBaseName} + ${id}`;
		symbolExpr = `/* @__PURE__ */ Symbol(${numericExpr})`;
	}
	if (st.profile) {
		const componentId = `${st.profileFilename || '<anon>'}#${owner.name}@${owner.line}:${owner.column}`;
		const loc = node.loc?.start;
		const metadata = {
			id: `${componentId}#hook:${id}`,
			componentId,
			name: local,
			kind: imported,
			file: st.profileFilename || '<anon>',
			line: loc?.line ?? 0,
			column: loc?.column ?? 0,
			index: id,
		};
		symbolExpr = `_$__profileHook(${symbolExpr}, ${JSON.stringify(metadata)})`;
	}
	st.decls.push(`const ${sym} = ${symbolExpr};`);
	return sym;
}

function parallelUseCallOfStatement(statement) {
	let call = null;
	if (
		statement?.type === 'VariableDeclaration' &&
		(statement.kind === 'const' || statement.kind === 'let') &&
		statement.declarations?.length === 1
	) {
		call = unwrapParallelUseValue(statement.declarations[0].init);
	} else if (statement?.type === 'ExpressionStatement') {
		call = unwrapParallelUseValue(statement.expression);
	}
	if (
		call?.type !== 'CallExpression' ||
		call._octaneImportedHook !== 'use' ||
		call.arguments.length === 0 ||
		call.arguments[0]?.type === 'SpreadElement'
	) {
		return null;
	}
	return call;
}

function requireParallelHelper(st, imported) {
	const request = st.environment === 'server' ? 'octane/server' : 'octane';
	const key = `${request}\0${imported}`;
	let helper = st.parallelHelpers.get(key);
	if (helper !== undefined) return helper.local;
	helper = {
		imported,
		local: allocSlotName(st, `_$${imported}`),
		request,
	};
	st.parallelHelpers.set(key, helper);
	return helper.local;
}

function emitParallelUseRun(run, owner, st) {
	if (run.uses.length === 0) return;
	const memoName = st.environment === 'server' ? 'puMemo' : 'useMemo';
	const batchName = st.environment === 'server' ? 'puBatch' : 'useBatch';
	const batchHelper = requireParallelHelper(st, batchName);
	const temps = [];
	const declarations = [];
	for (const entry of run.uses) {
		const temp = allocSlotName(st, `__pu$${st.nextPuId++}`);
		temps.push(temp);
		let creation = st.source.slice(entry.arg.start, entry.arg.end);
		if (!isTrivialParallelUseArg(entry.arg)) {
			const memoHelper = requireParallelHelper(st, memoName);
			const slot = allocHookSymbol(st, owner, 'use() memo', 'useMemo', entry.call);
			const deps = entry.dependencies.map((dependency) => dependency.text).join(', ');
			creation = `${memoHelper}(() => (${creation}), [${deps}], ${slot}${causalStateArgument(st.stateModel, memoName)})`;
		}
		declarations.push(`const ${temp} = ${creation};`);
		st.edits.push({ pos: entry.arg.start, end: entry.arg.end, text: temp });
	}
	const prefix = `${declarations.join(' ')} ${batchHelper}([${temps.join(', ')}]); `;
	st.edits.push({ pos: run.uses[0].statement.start, text: prefix });
}

function transformParallelUseStatementList(statements, owner, st) {
	let run = null;
	const flush = () => {
		if (run !== null) emitParallelUseRun(run, owner, st);
		run = null;
	};

	for (const statement of statements || []) {
		const call = parallelUseCallOfStatement(statement);
		const arg = call?.arguments[0];
		if (call !== null && canRewriteParallelUseArg(arg)) {
			const dependencies = collectParallelUseDependencies(arg, st.source);
			if (run !== null && dependencies.some((dependency) => run.names.has(dependency.root))) {
				flush();
			}
			if (run === null) run = { uses: [], names: new Set() };
			run.uses.push({ statement, call, arg, dependencies });
			if (statement.type === 'VariableDeclaration') {
				collectPatternNames(statement.declarations[0].id, run.names);
			}
			continue;
		}

		if (
			run !== null &&
			statement?.type === 'VariableDeclaration' &&
			(statement.kind === 'const' || statement.kind === 'let')
		) {
			for (const declaration of statement.declarations || []) {
				collectPatternNames(declaration.id, run.names);
			}
			continue;
		}

		flush();
		// Conditional blocks remain within this function's one execution scope.
		// Loops and nested functions deliberately stay untouched; each nested
		// function body is discovered and processed independently below.
		if (statement?.type === 'BlockStatement') {
			transformParallelUseStatementList(statement.body, owner, st);
		} else if (statement?.type === 'IfStatement') {
			if (statement.consequent?.type === 'BlockStatement') {
				transformParallelUseStatementList(statement.consequent.body, owner, st);
			}
			if (statement.alternate?.type === 'BlockStatement') {
				transformParallelUseStatementList(statement.alternate.body, owner, st);
			} else if (statement.alternate?.type === 'IfStatement') {
				transformParallelUseStatementList([statement.alternate], owner, st);
			}
		}
	}
	flush();
}

function collectParallelUseEdits(ast, st) {
	function scan(node, owner) {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) scan(child, owner);
			return;
		}
		if (
			node.type === 'VariableDeclarator' &&
			node.id?.type === 'Identifier' &&
			isFunctionNode(node.init)
		) {
			const functionOwner = hookOwner(node.id, node.id.name);
			if (node.init.body?.type === 'BlockStatement') {
				transformParallelUseStatementList(node.init.body.body, functionOwner, st);
			}
			for (const param of node.init.params || []) scan(param, functionOwner);
			scan(node.init.body, functionOwner);
			return;
		}
		if (isFunctionNode(node)) {
			const functionOwner = node.id?.type === 'Identifier' ? hookOwner(node, node.id.name) : owner;
			if (node.body?.type === 'BlockStatement') {
				transformParallelUseStatementList(node.body.body, functionOwner, st);
			}
			for (const param of node.params || []) scan(param, functionOwner);
			scan(node.body, functionOwner);
			return;
		}
		for (const key in node) {
			if (
				key === 'type' ||
				key === 'start' ||
				key === 'end' ||
				key === 'loc' ||
				key.startsWith('_octane')
			) {
				continue;
			}
			scan(node[key], owner);
		}
	}

	scan(ast.body, hookOwner(null, 'module'));
}

function walk(node, owner, st) {
	if (!node || typeof node !== 'object') return;
	if (Array.isArray(node)) {
		for (const n of node) walk(n, owner, st);
		return;
	}

	// A `const x = (…) => …` / `function …` gives the enclosing name used in the
	// (debug-only) slot key. For a named declaration the id is on the node; for an
	// arrow/expr assigned to a `const`, take the declarator name.
	if (
		node.type === 'VariableDeclarator' &&
		node.id?.type === 'Identifier' &&
		(node.init?.type === 'ArrowFunctionExpression' || node.init?.type === 'FunctionExpression')
	) {
		walk(node.init, hookOwner(node.id, node.id.name), st);
		return; // the id is a binding, no hooks there
	}
	const childOwner =
		node.type === 'FunctionDeclaration' && node.id ? hookOwner(node, node.id.name) : owner;

	if (node.type === 'CallExpression') {
		const imported = node._octaneImportedHook;
		if (imported && HOOK_NAMES.has(imported)) {
			const local =
				node.callee?.type === 'Identifier'
					? node.callee.name
					: `${node.callee?.object?.name || 'octane'}.${imported}`;
			const sym = allocHookSymbol(st, owner, local, imported, node);
			const stateModelArg = causalStateArgument(st.stateModel, imported);
			const inferred = st.inferred.get(node);
			if (inferred !== undefined) {
				// The dependency callback is already the final user argument. Insert
				// both the generated array and slot in one edit so equal-position edit
				// ordering cannot reverse them. Dependency nodes retain original source
				// offsets, preserving arbitrary TS syntax byte-for-byte.
				const deps = inferred.dependencies
					.map((dependency) => st.source.slice(dependency.node.start, dependency.node.end))
					.join(', ');
				st.edits.push({
					pos: node.arguments[node.arguments.length - 1].end,
					text: `, [${deps}], ${sym}${stateModelArg}`,
				});
			} else if (node.arguments.length === 0) {
				// `useId()` → `useId(_h$N)`. Symbols remain self-identifying when
				// optional user arguments are omitted.
				st.edits.push({
					pos: node.end - 1,
					text: sym + stateModelArg,
				});
			} else {
				// `useState(0)` → `useState(0, _h$N)` — insert AFTER the last arg's end so
				// trailing commas / whitespace before `)` stay valid.
				st.edits.push({
					pos: node.arguments[node.arguments.length - 1].end,
					text: ', ' + sym + stateModelArg,
				});
			}
			if (st.getterCalls.has(node) && STATE_GETTER_HELPERS[imported]) {
				let helper = st.getterHelpers.get(imported);
				if (helper === undefined) {
					const base = `_$${STATE_GETTER_HELPERS[imported]}`;
					helper = base;
					let suffix = 0;
					while (st.source.includes(helper)) helper = `${base}$${++suffix}`;
					st.getterHelpers.set(imported, helper);
				}
				st.edits.push({ pos: node.callee.start, end: node.callee.end, text: helper });
			}
		}
	}

	for (const k in node) {
		if (k === 'type' || k === 'start' || k === 'end' || k === 'loc') continue;
		const v = node[k];
		if (v && typeof v === 'object') walk(v, childOwner, st);
	}
}

/**
 * Inject per-call-site hook slots into octane BASE hook calls in a plain
 * `.ts`/`.js` module. Returns `null` (pass through unchanged) when the module
 * imports no octane base hook or calls none.
 *
 * @param {string} source raw module text
 * @param {string} id     module id (embedded in the stable Symbol.for key)
 * @param {{ environment?: 'client' | 'server', hmr?: boolean, profile?: boolean, profileFilename?: string, stateModel?: 'causal' | 'permissive', isVoidComponentImport?: (request: string, imported: string) => boolean }} [options] `hmr: true` (dev serve) emits
 *   `Symbol.for(stableKey)` so a re-imported module resolves the same hook
 *   slots (state survives HMR); off (ordinary prod builds and SSR) emits
 *   runtime-ranged Symbols. Profiling retains short described Symbols because
 *   hook metadata is keyed by Symbol identity.
 * @returns {{ code: string, map: null, diagnostics: readonly unknown[] } | null}
 */
export function slotHooks(source, id, options) {
	const stateModel = effectiveStateModel(options);
	const environment = options?.environment ?? 'client';
	if (environment !== 'client' && environment !== 'server') {
		throw new Error(
			`Unknown Octane environment ${JSON.stringify(environment)} — expected 'client' or 'server'.`,
		);
	}
	let ast;
	try {
		ast = parseModule(source, id);
	} catch {
		return null; // let the normal pipeline surface the parse error
	}
	const causalStateAnalysis =
		stateModel === 'causal'
			? analyzeCausalStateDiagnostics(ast, source, id, { onlyImported: true })
			: null;
	if (causalStateAnalysis !== null) assertNoCausalStateErrors(causalStateAnalysis);
	const importInfo = octaneHookLocals(ast);
	const canSpecializeRoot =
		!options?.hmr &&
		!options?.profile &&
		typeof options?.isVoidComponentImport === 'function' &&
		importInfo.hasOctaneImport;
	const inferred = importInfo.importsHook
		? analyzeHookDependencies(ast, {
				filename: id,
				onlyImported: true,
			})
		: new Map();

	const st = {
		locals: importInfo.locals,
		source,
		inferred,
		getterCalls: importInfo.importsHook ? collectStateGetterCalls(ast) : new WeakSet(),
		getterHelpers: new Map(),
		filename: id,
		profileFilename: (options && options.profileFilename) || id,
		hmr: !!(options && options.hmr),
		profile: !!(options && options.profile),
		environment,
		stateModel,
		hash: hookSlotHash(id),
		nextId: 0,
		nextPuId: 0,
		edits: [],
		decls: [],
		parallelHelpers: new Map(),
		usedNames: collectIdentifierNames(ast),
		slotBaseName: null,
		hookSlotsName: null,
		voidRootName: null,
		causalStateMarkerName: null,
		causalStateMethodsMarkerName: null,
		causalStateForcedFunctions: null,
	};
	if (stateModel === 'causal') {
		const aliases = analyzeCausalComponentAliases(ast);
		assertNoUnresolvedCausalComponentAliases(aliases, id);
		st.causalStateForcedFunctions = aliases.forcedFunctions;
		collectCausalDefinitionEdits(ast, st);
	}
	if (!st.hmr && !st.profile) st.slotBaseName = allocSlotName(st, '_hs$');
	if (importInfo.importsHook) {
		collectParallelUseEdits(ast, st);
		for (const node of ast.body || []) walk(node, hookOwner(null, 'module'), st);
	}
	if (canSpecializeRoot) {
		collectVoidRootEdits(ast, st, options.isVoidComponentImport);
	}
	if (st.edits.length === 0) {
		return causalStateAnalysis?.reports.length
			? { code: source, map: null, diagnostics: causalStateAnalysis.reports }
			: null;
	}

	// Apply insertions right-to-left so earlier offsets stay valid.
	st.edits.sort((a, b) => b.pos - a.pos);
	let code = source;
	for (const e of st.edits) {
		code = code.slice(0, e.pos) + e.text + code.slice(e.end === undefined ? e.pos : e.end);
	}

	// APPEND the slot consts (rather than prepend) so every original line number
	// stays put — this pass emits no source map, so aligned lines are what keep
	// stack traces / breakpoints in the user's `.ts` accurate. `Symbol.for` is
	// side-effect-free and the consts are read only inside function bodies (which
	// run after the module is fully evaluated, including cross-module imports), so
	// trailing placement has no TDZ hazard for any valid hook usage.
	const helperSpecifiers = [...st.getterHelpers].map(
		([hook, local]) => `${STATE_GETTER_HELPERS[hook]} as ${local}`,
	);
	if (st.causalStateMarkerName !== null) {
		helperSpecifiers.push(`markStateModel as ${st.causalStateMarkerName}`);
	}
	if (st.causalStateMethodsMarkerName !== null) {
		helperSpecifiers.push(`markStateModelMethods as ${st.causalStateMethodsMarkerName}`);
	}
	if (st.voidRootName !== null) {
		helperSpecifiers.push(`__createVoidRoot as ${st.voidRootName}`);
	}
	for (const helper of st.parallelHelpers.values()) {
		if (helper.request === 'octane') {
			helperSpecifiers.push(`${helper.imported} as ${helper.local}`);
		}
	}
	if (!st.hmr && !st.profile && st.nextId > 0) {
		st.hookSlotsName = allocSlotName(st, '_$hookSlots');
		helperSpecifiers.unshift(`hookSlots as ${st.hookSlotsName}`);
	}
	const helperImport =
		helperSpecifiers.length === 0
			? ''
			: `import { ${helperSpecifiers.join(', ')} } from 'octane';\n`;
	const serverHelperSpecifiers = [...st.parallelHelpers.values()]
		.filter((helper) => helper.request === 'octane/server')
		.map((helper) => `${helper.imported} as ${helper.local}`);
	const serverHelperImport =
		serverHelperSpecifiers.length === 0
			? ''
			: `import { ${serverHelperSpecifiers.join(', ')} } from 'octane/server';\n`;
	const profileImport = st.profile
		? "import { __profileHook as _$__profileHook } from 'octane/profiling';\n"
		: '';
	const slotBase =
		!st.hmr && !st.profile && st.nextId > 0
			? `const ${st.slotBaseName} = /* @__PURE__ */ ${st.hookSlotsName}(${st.nextId});\n`
			: '';
	const block =
		helperImport + serverHelperImport + profileImport + slotBase + st.decls.join('\n') + '\n';
	code = code.endsWith('\n') ? code + block : code + '\n' + block;
	return { code, map: null, diagnostics: causalStateAnalysis?.reports ?? [] };
}
