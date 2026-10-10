import { builders as b, clone_ast_node as clone, strongHash } from '@tsrx/core';
import { parseModule } from '#octane/compiler-parser';
import { print } from 'esrap';
import tsx from 'esrap/languages/tsx';

const id = (node, name) => node?.type === 'Identifier' && node.name === name;
const propertyName = (node) =>
	node?.type === 'Identifier' ? node.name : node?.type === 'Literal' ? node.value : undefined;
const member = (node, object, property, computed = false) =>
	node?.type === 'MemberExpression' &&
	!node.optional &&
	node.computed === computed &&
	id(node.object, object) &&
	(computed ? id(node.property, property) : propertyName(node.property) === property);

const ordinaryImport = (node) =>
	(node.phase == null || node.phase === 'evaluation') &&
	!(node.attributes?.length > 0) &&
	!(node.assertions?.length > 0);

function singleConst(statement) {
	if (
		statement?.type !== 'VariableDeclaration' ||
		statement.kind !== 'const' ||
		statement.declarations.length !== 1
	)
		return null;
	const declaration = statement.declarations[0];
	return declaration.id?.type === 'Identifier' ? declaration : null;
}

/**
 * A deliberately small elementwise projection proof. This is only the helper
 * half: adapters must also prove the final imported component is an ordinary
 * comparator-free memo, and the compiler must prove a render-only callsite.
 * Ordinary helper exports are never rewritten or given a mutable cache.
 */
export function analyzeDescriptorProjection(source, filename, exported) {
	let ast;
	try {
		ast = typeof source === 'string' ? parseModule(source, filename) : source;
	} catch {
		return null;
	}
	const bindings = new Map();
	const imports = [];
	const exports = new Map();
	let fn;
	for (const statement of ast.body || []) {
		if (statement.type === 'ImportDeclaration') {
			if (statement.importKind === 'type') continue;
			if (!ordinaryImport(statement)) return null;
			// Only actual binding edges are pinned by the adapter. A duplicate
			// side-effect import from the query issuer could resolve differently.
			if (statement.specifiers.every((specifier) => specifier.importKind === 'type')) return null;
			for (const specifier of statement.specifiers) {
				if (specifier.importKind === 'type') continue;
				if (specifier.type !== 'ImportSpecifier' || specifier.imported.type !== 'Identifier')
					return null;
				const binding = {
					local: specifier.local.name,
					request: statement.source.value,
					imported: propertyName(specifier.imported),
				};
				bindings.set(binding.local, binding);
				imports.push(binding);
			}
		} else if (statement.type === 'FunctionDeclaration' && fn === undefined) {
			fn = statement;
		} else if (statement.type === 'ExportNamedDeclaration' && statement.source == null) {
			if (statement.declaration?.type === 'FunctionDeclaration' && fn === undefined) {
				fn = statement.declaration;
				exports.set(fn.id?.name, fn.id?.name);
			} else if (statement.declaration == null) {
				for (const specifier of statement.specifiers) {
					if (
						specifier.type !== 'ExportSpecifier' ||
						specifier.exportKind === 'type' ||
						specifier.local.type !== 'Identifier' ||
						specifier.exported.type !== 'Identifier'
					)
						return null;
					exports.set(propertyName(specifier.exported), propertyName(specifier.local));
				}
			} else return null;
		} else return null;
	}
	if (
		!fn ||
		exports.get(exported) !== fn.id?.name ||
		fn.async ||
		fn.generator ||
		fn.params.length !== 1 ||
		fn.params[0].type !== 'Identifier' ||
		fn.body.body.length !== 3
	)
		return null;
	const input = fn.params[0].name;
	const [allocation, loop, returned] = fn.body.body;
	const outputDeclaration = singleConst(allocation);
	if (
		!outputDeclaration ||
		outputDeclaration.init?.type !== 'NewExpression' ||
		!id(outputDeclaration.init.callee, 'Array') ||
		outputDeclaration.init.arguments.length !== 1 ||
		!member(outputDeclaration.init.arguments[0], input, 'length')
	)
		return null;
	const output = outputDeclaration.id.name;
	if (
		loop?.type !== 'ForStatement' ||
		loop.init?.type !== 'VariableDeclaration' ||
		loop.init.kind !== 'let' ||
		loop.init.declarations.length !== 1
	)
		return null;
	const counter = loop.init.declarations[0];
	if (
		counter.id?.type !== 'Identifier' ||
		counter.init?.type !== 'Literal' ||
		counter.init.value !== 0
	)
		return null;
	const index = counter.id.name;
	if (
		loop.test?.type !== 'BinaryExpression' ||
		loop.test.operator !== '<' ||
		!id(loop.test.left, index) ||
		!member(loop.test.right, input, 'length') ||
		loop.update?.type !== 'UpdateExpression' ||
		loop.update.operator !== '++' ||
		loop.update.prefix ||
		!id(loop.update.argument, index) ||
		loop.body?.type !== 'BlockStatement' ||
		loop.body.body.length !== 2
	)
		return null;
	const itemDeclaration = singleConst(loop.body.body[0]);
	if (!itemDeclaration || !member(itemDeclaration.init, input, index, true)) return null;
	const item = itemDeclaration.id.name;
	const assignment = loop.body.body[1]?.expression;
	if (
		assignment?.type !== 'AssignmentExpression' ||
		assignment.operator !== '=' ||
		!member(assignment.left, output, index, true)
	)
		return null;
	const call = assignment.right;
	if (
		call?.type !== 'CallExpression' ||
		call.optional ||
		call.arguments.length !== 2 ||
		call.callee.type !== 'Identifier'
	)
		return null;
	const factory = call.callee.name;
	if (
		bindings.get(factory)?.request !== 'octane' ||
		bindings.get(factory)?.imported !== 'createElement'
	)
		return null;
	const component = call.arguments[0];
	if (component?.type !== 'Identifier' || !bindings.has(component.name)) return null;
	const props = call.arguments[1];
	if (props?.type !== 'ObjectExpression' || props.properties.length === 0) return null;
	const captured = new Set([factory, component.name]);
	const names = new Set();
	for (const [position, property] of props.properties.entries()) {
		if (
			property.type !== 'Property' ||
			property.computed ||
			property.method ||
			property.kind !== 'init'
		)
			return null;
		const name = propertyName(property.key);
		if (
			typeof name !== 'string' ||
			names.has(name) ||
			['__proto__', 'ref', 'children'].includes(name)
		)
			return null;
		names.add(name);
		if ((position === 0) !== (name === 'key')) return null;
		const value = property.value;
		if (
			value?.type === 'Literal' &&
			(value.value === null ||
				['string', 'number', 'boolean', 'bigint'].includes(typeof value.value))
		)
			continue;
		if (
			value?.type === 'MemberExpression' &&
			!value.computed &&
			!value.optional &&
			id(value.object, item) &&
			value.property.type === 'Identifier'
		)
			continue;
		if (value?.type === 'Identifier' && bindings.has(value.name)) {
			captured.add(value.name);
			continue;
		}
		return null;
	}
	if (returned?.type !== 'ReturnStatement' || !id(returned.argument, output)) return null;
	if (
		[input, output, index, item, 'Array'].some((name) => bindings.has(name)) ||
		[input, output, index, item, fn.id.name].includes('Array') ||
		new Set([input, output, index, item]).size !== 4
	)
		return null;
	const captures = [...captured].map((name) => bindings.get(name));
	const shape = {
		kind: 'numeric-for/createElement/first-key',
		exported,
		input,
		output,
		index,
		item,
		imports,
		factory,
		component: component.name,
		props: props.properties.map((property) => {
			const value = property.value;
			return {
				name: propertyName(property.key),
				kind: value.type,
				value:
					value.type === 'Identifier'
						? value.name
						: value.type === 'MemberExpression'
							? value.property.name
							: [typeof value.value, String(value.value)],
			};
		}),
	};
	return {
		exported,
		fingerprint: strongHash(JSON.stringify(shape)),
		component: {
			request: bindings.get(component.name).request,
			imported: bindings.get(component.name).imported,
		},
		componentCaptureIndex: captures.findIndex((capture) => capture.local === component.name),
		captures,
		staticPropNames: [...names].filter((name) => name !== 'key'),
		imports,
		ast,
		filename,
		allocation,
		loop,
		assignment,
		props,
		input,
		output,
		index,
		item,
		componentLocal: component.name,
	};
}

/** A preflight superset; compile.js still owns lexical/render-only admission. */
export function findDescriptorProjectionExports(source, filename) {
	let ast;
	try {
		ast = typeof source === 'string' ? parseModule(source, filename) : source;
	} catch {
		return [];
	}
	const names = [];
	for (const statement of ast.body || []) {
		if (statement.type !== 'ExportNamedDeclaration' || statement.source != null) continue;
		if (statement.declaration?.type === 'FunctionDeclaration')
			names.push(statement.declaration.id?.name);
		for (const specifier of statement.specifiers || [])
			names.push(propertyName(specifier.exported));
	}
	return names.flatMap((exported) => {
		const analysis = analyzeDescriptorProjection(ast, filename, exported);
		return analysis === null ? [] : [{ exported, fingerprint: analysis.fingerprint }];
	});
}

/** A preflight superset; compile.js still owns lexical/render-only admission. */
export function findDescriptorProjectionImports(source, filename) {
	let ast;
	try {
		ast = typeof source === 'string' ? parseModule(source, filename) : source;
	} catch {
		return [];
	}
	const imports = new Map();
	for (const statement of ast.body || []) {
		if (statement.type !== 'ImportDeclaration' || statement.importKind === 'type') continue;
		if (!ordinaryImport(statement)) continue;
		for (const specifier of statement.specifiers) {
			if (
				specifier.type !== 'ImportSpecifier' ||
				specifier.importKind === 'type' ||
				specifier.imported.type !== 'Identifier'
			)
				continue;
			imports.set(specifier.local.name, {
				local: specifier.local.name,
				request: statement.source.value,
				imported: propertyName(specifier.imported),
			});
		}
	}
	const found = new Set();
	const visit = (node) => {
		if (node === null || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		if (
			node.type === 'CallExpression' &&
			!node.optional &&
			node.arguments.length === 1 &&
			node.arguments[0].type !== 'SpreadElement' &&
			node.callee.type === 'Identifier' &&
			imports.has(node.callee.name)
		)
			found.add(node.callee.name);
		for (const key in node) {
			if (['metadata', 'loc', 'start', 'end', 'comments'].includes(key)) continue;
			visit(node[key]);
		}
	};
	visit(ast);
	return [...found].map((name) => imports.get(name));
}

/** Emit one query module, after the adapter validates the final source proof. */
export function emitDescriptorProjection(a, { originalRequest, exportName, importRequests = {} }) {
	const used = new Set([
		a.input,
		a.output,
		a.index,
		a.item,
		a.exported,
		exportName,
		...a.imports.map((entry) => entry.local),
	]);
	const name = (hint) => {
		let result = hint;
		while (used.has(result)) result += '$';
		used.add(result);
		return result;
	};
	const previous = name('__previous');
	const original = name('__original');
	const guard = name('__canProject');
	const equal = name('__equal');
	const warm = name('__warm');
	const same = name('__same');
	const key = name('__key');
	const descriptor = name('__descriptor');
	const items = name('__items');
	const keys = name('__keys');
	const dense = name('__dense');
	const eligible = name('__eligible');
	const previousPrepared = name('__previousPrepared');
	const firstChangedKey = name('__firstChangedKey');
	const descriptorKey = name('__descriptorKey');
	const reused = name('__reused');
	const preparedKeys = name('__preparedKeys');
	const cache = name('__cache');
	const captureNames = new Map(a.captures.map(({ local }) => [local, name('__capture')]));
	const access = (object, property) =>
		b.member(typeof object === 'string' ? b.id(object) : object, b.id(property));
	const at = (object, index) =>
		b.member(
			typeof object === 'string' ? b.id(object) : object,
			typeof index === 'string' ? b.id(index) : b.literal(index),
			true,
		);
	const and = (...nodes) => nodes.reduce((left, right) => b.logical('&&', left, right));
	const assign = (target, value) =>
		b.assignment('=', typeof target === 'string' ? b.id(target) : target, value);
	const capture = (expression, cold) => {
		if (expression.type !== 'Identifier' || !captureNames.has(expression.name))
			return clone(expression);
		const saved = captureNames.get(expression.name);
		return cold ? assign(saved, clone(expression)) : b.id(saved);
	};
	const makeElement = (cold) =>
		b.call(
			capture(a.assignment.right.callee, cold),
			capture(a.assignment.right.arguments[0], cold),
			b.object(
				a.props.properties.map((property, index) =>
					b.prop(
						'init',
						clone(property.key),
						index === 0
							? cold
								? assign(key, capture(property.value, true))
								: b.id(key)
							: capture(property.value, cold),
					),
				),
			),
		);
	const canProject = () =>
		b.call(
			b.id(guard),
			b.id(captureNames.get(a.componentLocal)),
			b.array(a.staticPropNames.map((prop) => b.literal(prop))),
		);
	const result = (value, retained, isDense) =>
		b.object([
			b.init('value', value),
			b.init('cache', retained),
			b.init('denseExplicitKeys', isDense),
		]);
	const prior = (field, index) => at(access(previous, field), index);
	const primitive = b.logical(
		'||',
		b.binary('===', b.id(key), b.literal(null)),
		and(
			...['object', 'function', 'symbol'].map((type) =>
				b.binary('!==', b.unary('typeof', b.id(key)), b.literal(type)),
			),
		),
	);
	const hit = and(
		b.id(same),
		primitive,
		b.binary('<', b.id(a.index), access(access(previous, 'items'), 'length')),
		b.call(b.id(equal), prior('items', a.index), b.id(a.item)),
		b.call(b.id(equal), prior('keys', a.index), b.id(key)),
	);
	const declarations = [
		b.const(
			warm,
			and(
				b.binary('!=', b.id(previous), b.literal(null)),
				b.binary('===', access(previous, 'eligible'), b.literal(true)),
			),
		),
		b.declaration(
			'let',
			[...captureNames.values()].map((local) => b.declarator(b.id(local), null)),
		),
		b.if(
			b.id(warm),
			b.block([
				...a.captures.map(({ local }) => b.stmt(assign(captureNames.get(local), b.id(local)))),
				b.if(
					b.unary('!', canProject()),
					b.block([
						b.return(
							result(b.call(b.id(original), b.id(a.input)), b.literal(null), b.literal(false)),
						),
					]),
				),
			]),
		),
		// Keep allocation/length/index/key and cold import reads in authored order.
		// A previous eligible cache proves these direct ESM reads left their TDZ.
		b.const(a.output, clone(a.allocation.declarations[0].init)),
		b.const(
			same,
			and(
				b.id(warm),
				...a.captures.map(({ local }, index) =>
					b.call(b.id(equal), prior('captures', index), b.id(captureNames.get(local))),
				),
			),
		),
		b.const(items, b.array([])),
		b.const(keys, b.array([])),
		// Bound spare capacity by the previous snapshot: the input's length can
		// change between the authored allocation and the first loop condition.
		b.if(
			b.id(warm),
			b.block([
				b.stmt(
					assign(
						access(items, 'length'),
						assign(
							access(keys, 'length'),
							b.conditional(
								b.binary(
									'<',
									access(a.output, 'length'),
									access(access(previous, 'items'), 'length'),
								),
								access(a.output, 'length'),
								access(access(previous, 'items'), 'length'),
							),
						),
					),
				),
			]),
		),
		b.const(
			previousPrepared,
			b.conditional(b.id(warm), access(previous, 'preparedKeys'), b.literal(null)),
		),
		b.let(
			firstChangedKey,
			b.conditional(
				b.binary('===', b.id(previousPrepared), b.literal(null)),
				b.literal(0),
				b.literal(-1),
			),
		),
		b.let(dense, b.literal(true)),
		b.let(a.index, b.literal(0)),
		b.for(
			null,
			clone(a.loop.test),
			clone(a.loop.update),
			b.block([
				b.const(a.item, at(a.input, a.index)),
				b.declaration('let', [b.declarator(b.id(key), null), b.declarator(b.id(descriptor), null)]),
				b.let(reused, b.literal(false)),
				b.stmt(
					assign(
						at(a.output, a.index),
						assign(
							descriptor,
							b.conditional(
								b.id(warm),
								b.sequence([
									assign(key, capture(a.props.properties[0].value, false)),
									b.conditional(assign(reused, hit), prior('values', a.index), makeElement(false)),
								]),
								makeElement(true),
							),
						),
					),
				),
				b.stmt(assign(at(items, a.index), b.id(a.item))),
				b.stmt(assign(at(keys, a.index), b.id(key))),
				// Reused private descriptors keep their certified string key. Without
				// previous prepared keys, unkeyed rows still need the ordinary fallback.
				b.if(
					b.logical(
						'||',
						b.unary('!', b.id(reused)),
						b.binary('===', b.id(previousPrepared), b.literal(null)),
					),
					b.block([
						b.const(descriptorKey, access(descriptor, 'key')),
						b.if(
							b.binary('!==', b.unary('typeof', b.id(descriptorKey)), b.literal('string')),
							b.block([b.stmt(assign(dense, b.literal(false)))]),
						),
						b.if(
							and(
								b.binary('===', b.id(firstChangedKey), b.literal(-1)),
								b.logical(
									'||',
									b.binary('>=', b.id(a.index), access(previousPrepared, 'length')),
									b.binary('!==', b.id(descriptorKey), access(prior('values', a.index), 'key')),
								),
							),
							b.block([b.stmt(assign(firstChangedKey, b.id(a.index)))]),
						),
					]),
				),
			]),
		),
		// Snapshot only completed writes; the authored output can retain holes
		// when its length shrinks during iteration or the loop never starts.
		b.if(
			b.id(warm),
			b.block([
				b.stmt(assign(access(items, 'length'), assign(access(keys, 'length'), b.id(a.index)))),
			]),
		),
		// Nothing is published until the entire authored helper completes. In
		// particular an empty or throwing cold invocation never primes captures.
		b.const(
			eligible,
			and(
				b.binary('!==', access(items, 'length'), b.literal(0)),
				b.logical('||', b.id(warm), canProject()),
			),
		),
		b.stmt(
			assign(
				dense,
				and(
					b.id(eligible),
					b.id(dense),
					b.binary('===', access(items, 'length'), access(a.output, 'length')),
				),
			),
		),
		b.let(preparedKeys, b.literal(null)),
		// Prepared flat keys are immutable snapshots. A stable key sequence adds
		// no second traversal or array allocation; changed suffixes copy only
		// after the helper and metadata guard succeed. No application String()
		// call moves here: dispatch separately guards the intrinsic conversion.
		b.if(
			b.id(dense),
			b.block([
				b.if(
					and(
						b.binary('===', b.id(firstChangedKey), b.literal(-1)),
						b.binary('===', access(previousPrepared, 'length'), access(a.output, 'length')),
					),
					b.block([b.stmt(assign(preparedKeys, b.id(previousPrepared)))]),
					b.block([
						b.stmt(
							assign(
								preparedKeys,
								b.conditional(
									b.binary('===', b.id(previousPrepared), b.literal(null)),
									b.array([]),
									b.call(
										access(previousPrepared, 'slice'),
										b.literal(0),
										b.conditional(
											b.binary('===', b.id(firstChangedKey), b.literal(-1)),
											access(a.output, 'length'),
											b.id(firstChangedKey),
										),
									),
								),
							),
						),
						b.for(
							b.let(a.index, access(preparedKeys, 'length')),
							b.binary('<', b.id(a.index), access(a.output, 'length')),
							clone(a.loop.update),
							b.block([
								b.const(descriptorKey, access(at(a.output, a.index), 'key')),
								b.stmt(
									assign(
										at(preparedKeys, a.index),
										b.conditional(
											and(
												b.binary('!==', b.id(previousPrepared), b.literal(null)),
												b.binary('<', b.id(a.index), access(previousPrepared, 'length')),
												b.binary(
													'===',
													b.id(descriptorKey),
													access(prior('values', a.index), 'key'),
												),
											),
											at(previousPrepared, a.index),
											b.binary('+', b.literal('k'), b.id(descriptorKey)),
										),
									),
								),
							]),
						),
					]),
				),
			]),
		),
		b.const(
			cache,
			b.conditional(
				b.id(eligible),
				b.object([
					b.init('items', b.id(items)),
					b.init('keys', b.id(keys)),
					b.init('values', b.id(a.output)),
					b.init('captures', b.array(a.captures.map(({ local }) => b.id(captureNames.get(local))))),
					b.init('eligible', b.literal(true)),
					b.init('preparedKeys', b.id(preparedKeys)),
				]),
				b.literal(null),
			),
		),
		b.return(result(b.id(a.output), b.id(cache), b.id(dense))),
	];
	const body = [
		b.imports([[a.exported, original]], originalRequest),
		...a.ast.body
			.filter(
				(statement) => statement.type === 'ImportDeclaration' && statement.importKind !== 'type',
			)
			.map((statement) =>
				b.imports(
					statement.specifiers
						.filter((specifier) => specifier.importKind !== 'type')
						.map((specifier) => [propertyName(specifier.imported), specifier.local.name]),
					importRequests[statement.source.value] ?? statement.source.value,
				),
			),
		b.imports(
			[
				['compilerCanCacheDescriptorProjection', guard],
				['hookMemoEqual', equal],
			],
			'octane/internal/client',
		),
		b.export(
			b.function_declaration(
				b.id(exportName),
				[b.id(a.input), b.id(previous)],
				b.block(declarations),
			),
		),
	];
	return print({ ...a.ast, body }, tsx(), { sourceMapSource: a.filename });
}
