import { parseModule } from '@tsrx/core';
import { createLexicalAnalysis } from './compile-universal.js';

const CSS_MODULE_REQUEST = /\.module\.(?:css|less|sass|scss|styl|stylus|pcss|postcss)(?:$|[?#])/;
const PLAIN_CSS_MODULE_ID = /\.module\.(?:css|less|sass|scss|styl|stylus|pcss|postcss)$/;

export function isPlainCssModuleId(id) {
	return typeof id === 'string' && !id.startsWith('\0') && PLAIN_CSS_MODULE_ID.test(id);
}

/** Only authored CSS-module imports can ask the host for this narrow proof. */
export function findCssModuleImportRequests(source, id) {
	let ast;
	if (source && typeof source === 'object' && source.type === 'Program') {
		ast = source;
	} else {
		if (typeof source !== 'string' || !source.includes('.module.')) return [];
		try {
			ast = parseModule(source, id);
		} catch {
			return [];
		}
	}
	const requests = new Set();
	for (const statement of ast.body ?? []) {
		if (
			statement.type !== 'ImportDeclaration' ||
			statement.importKind === 'type' ||
			statement.attributes?.length > 0 ||
			statement.assertions?.length > 0 ||
			typeof statement.source?.value !== 'string' ||
			!CSS_MODULE_REQUEST.test(statement.source.value)
		) {
			continue;
		}
		if (statement.specifiers?.some((specifier) => specifier.importKind !== 'type')) {
			requests.add(statement.source.value);
		}
	}
	return [...requests];
}

function stringValue(node, strings) {
	if (
		(node?.type === 'Literal' || node?.type === 'StringLiteral') &&
		typeof node.value === 'string'
	) {
		return node.value;
	}
	if (node?.type === 'Identifier') return strings.get(node.name);
	return undefined;
}

function exportedName(node) {
	if (node?.type === 'Identifier') return node.name;
	return typeof node?.value === 'string' ? node.value : undefined;
}

function frozenRecordArgument(node) {
	if (
		node?.type !== 'CallExpression' ||
		node.optional === true ||
		node.arguments?.length !== 1 ||
		node.callee?.type !== 'MemberExpression' ||
		node.callee.computed === true ||
		node.callee.optional === true ||
		node.callee.object?.type !== 'Identifier' ||
		node.callee.object.name !== 'Object' ||
		node.callee.property?.type !== 'Identifier' ||
		node.callee.property.name !== 'freeze'
	) {
		return null;
	}
	return node.arguments[0];
}

function recordValue(node, strings) {
	if (node?.type !== 'ObjectExpression') return null;
	const record = new Map();
	for (const property of node.properties ?? []) {
		if (
			property.type !== 'Property' ||
			property.kind !== 'init' ||
			property.computed === true ||
			property.method === true
		) {
			return null;
		}
		const key = exportedName(property.key);
		const value = stringValue(property.value, strings);
		// In an object literal this spelling sets the prototype instead of
		// defining an own property. Never manufacture a class that is absent.
		if (key === undefined || key === '__proto__' || value === undefined || record.has(key)) {
			return null;
		}
		record.set(key, value);
	}
	return record;
}

/**
 * Read an external CSS provider's final ESM source without running it. This
 * never receives an Octane-printed Program. The automatic proof accepts
 * only a pure sequence of initialized const strings and literal export maps.
 * A default map is deliberately data, not proof of immutability. A provider
 * must separately guarantee its lifetime and initialization before it can be
 * used. Calls, re-exports, getters, spreads, and mutable bindings never become
 * automatic facts by default. A host may additionally accept unwritten vars
 * from an entirely pure final module, as emitted by CSS extraction loaders.
 *
 * @param {string} source
 * @param {{ allowPureVar?: boolean }} [options]
 */
export function readCssModuleExports(source, options) {
	let ast;
	try {
		ast = parseModule(source, 'css-module.js');
	} catch {
		return null;
	}
	if (options?.allowPureVar === true) {
		const exports = readCssModuleAst(ast, true);
		// A var is not a constant merely because its initializer is a string.
		// The complete module must exclude writes, calls, imports, and every
		// other statement that could expose or change it. Fall back to the
		// const-only reader so an impure module leaks no var-derived aliases or
		// default-map values into an explicit provider's evidence either.
		if (exports.pure) return exports;
	}
	return readCssModuleAst(ast, false);
}

function readCssModuleAst(ast, allowPureVar) {
	const strings = new Map();
	const frozenRecords = new Map();
	const named = new Map();
	const declarations = new Set();
	let defaultRecord = null;
	let pure = true;
	let lexical = null;
	const freezeArgument = (node) => {
		const argument = frozenRecordArgument(node);
		if (argument === null) return null;
		lexical ??= createLexicalAnalysis(ast);
		const object = node.callee.object;
		return lexical.resolveBinding(lexical.nodeScopes.get(object) ?? lexical.rootScope, 'Object') ==
			null
			? argument
			: null;
	};
	const publish = (name, value) => {
		if (name === undefined || value === undefined || named.has(name)) return false;
		named.set(name, value);
		return true;
	};
	const readDefault = (node) => {
		const value = stringValue(node, strings);
		if (value !== undefined) return publish('default', value);
		if (node?.type === 'Identifier' && frozenRecords.has(node.name)) {
			defaultRecord = frozenRecords.get(node.name);
			return true;
		}
		const frozen = freezeArgument(node);
		if (frozen !== null) pure = false;
		const record = recordValue(frozen ?? node, strings);
		if (record === null || defaultRecord !== null) return false;
		defaultRecord = record;
		return true;
	};
	for (const statement of ast.body ?? []) {
		const exported = statement.type === 'ExportNamedDeclaration';
		const declaration = exported ? statement.declaration : statement;
		if (
			declaration?.type === 'VariableDeclaration' &&
			(declaration.kind === 'const' || (allowPureVar && declaration.kind === 'var'))
		) {
			for (const item of declaration.declarations ?? []) {
				if (item.id?.type !== 'Identifier' || declarations.has(item.id.name)) {
					pure = false;
					continue;
				}
				declarations.add(item.id.name);
				const value = stringValue(item.init, strings);
				if (value !== undefined) {
					strings.set(item.id.name, value);
					if (exported && !publish(item.id.name, value)) pure = false;
					continue;
				}
				const frozen = freezeArgument(item.init);
				const record = frozen === null ? null : recordValue(frozen, strings);
				if (record !== null) frozenRecords.set(item.id.name, record);
				pure = false;
			}
			continue;
		}
		if (statement.type === 'ExportDefaultDeclaration') {
			if (!readDefault(statement.declaration)) pure = false;
			continue;
		}
		if (exported && statement.declaration == null && statement.source == null) {
			for (const specifier of statement.specifiers ?? []) {
				const local = exportedName(specifier.local);
				const name = exportedName(specifier.exported);
				if (name === 'default' && frozenRecords.has(local)) {
					if (defaultRecord !== null) pure = false;
					else defaultRecord = frozenRecords.get(local);
				} else if (!publish(name, strings.get(local))) {
					pure = false;
				}
			}
			continue;
		}
		if (statement.type !== 'EmptyStatement') pure = false;
	}
	return { named, default: defaultRecord, pure };
}

function ownDataProperties(value, invalid, label) {
	if (
		value === null ||
		typeof value !== 'object' ||
		Array.isArray(value) ||
		(Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
	) {
		invalid(`${label} must be a plain record`);
	}
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const properties = new Map();
	for (const key of Reflect.ownKeys(descriptors)) {
		const descriptor = descriptors[key];
		if (typeof key !== 'string' || !Object.hasOwn(descriptor, 'value')) {
			invalid(`${label} must contain only own data properties`);
		}
		properties.set(key, descriptor.value);
	}
	return properties;
}

/** Validate an explicit host assertion against the exact module it describes. */
export function validateCssModuleConstants(
	provided,
	exports,
	id,
	diagnosticOwner = 'octane/compiler/vite',
) {
	if (provided == null) return null;
	const invalid = (reason) => {
		throw new TypeError(
			`${diagnosticOwner}: invalid cssModuleConstants for ${JSON.stringify(id)}: ${reason}.`,
		);
	};
	const fields = ownDataProperties(provided, invalid, 'the provider result');
	for (const field of fields.keys()) {
		if (field !== 'named' && field !== 'default') invalid(`unknown field ${JSON.stringify(field)}`);
	}
	const result = { named: new Map(), default: new Map() };
	for (const field of ['named', 'default']) {
		if (!fields.has(field)) continue;
		const values = ownDataProperties(fields.get(field), invalid, field);
		for (const [name, value] of values) {
			if (typeof value !== 'string') invalid(`${field}.${name} is not a string`);
			if (exports?.[field]?.get(name) !== value) {
				invalid(`${field}.${name} does not match an initialized string in the final module`);
			}
			result[field].set(name, value);
		}
	}
	return result;
}
