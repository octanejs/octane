// Certify exact private forwarding bodies without changing their callable entry.
// Client call sites may skip these owners while retaining the authored signal path.
export function markLocalComponentDelegations(ast, filename, tools) {
	const {
		mapAst,
		collectFreeIdentifiers,
		collectReassignedBindings,
		createLexicalAnalysis,
		isComponentTag,
		isVoidJsxCodeBlockFunction,
		hasInlineMemoDirectEval,
		forEachRuntimeAstChild,
		isIdentifierReference,
		componentInvocationSite,
	} = tools;
	const declarations = new Map(),
		duplicates = new Set(),
		wrappers = new Map();
	const element = (node) => node?.type === 'Element' || node?.type === 'JSXElement';
	const tag = (node) => node.openingElement?.name || node.id;
	const attrs = (node) => node.attributes || node.openingElement?.attributes || [];
	for (const statement of ast.body) {
		const node =
			statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration'
				? statement.declaration
				: statement;
		if (node?.type !== 'FunctionDeclaration' || node.id?.type !== 'Identifier') continue;
		const name = node.id.name;
		if (declarations.has(name)) duplicates.add(name);
		declarations.set(name, node);
		const parameter = node.params[0],
			call = node.body?.render;
		if (
			statement !== node ||
			node.async ||
			node.generator ||
			node.body?.type !== 'JSXCodeBlock' ||
			(node.body.body?.length ?? 0) !== 0 ||
			node.params.length !== 1 ||
			parameter.type !== 'Identifier' ||
			['this', '__s', '__extra'].includes(parameter.name) ||
			!element(call) ||
			!isComponentTag(call) ||
			!['Identifier', 'JSXIdentifier'].includes(tag(call)?.type) ||
			(call.children?.length ?? 0) !== 0
		)
			continue;
		const attributes = attrs(call),
			spread = attributes[0];
		if (
			attributes.length !== 1 ||
			!['SpreadAttribute', 'JSXSpreadAttribute'].includes(spread.type) ||
			spread.argument?.type !== 'Identifier' ||
			spread.argument.name !== parameter.name
		)
			continue;
		wrappers.set(name, { node, call, target: tag(call).name, incoming: 0 });
	}
	// Most modules have no forwarding wrapper; avoid any whole-module analysis.
	if (wrappers.size === 0 || typeof isVoidJsxCodeBlockFunction !== 'function') return ast;
	if (
		hasInlineMemoDirectEval(ast) ||
		ast.body.some(
			(node) =>
				node.type === 'ImportDeclaration' &&
				(node.source.value === 'server' ||
					/^octane\/(signals|react)(\/|$)/.test(node.source.value)),
		)
	)
		return ast;
	const lexical = createLexicalAnalysis(ast),
		reassigned = collectReassignedBindings(ast);
	const rootTag = (node) => {
		const id = tag(node),
			scope = id && lexical.nodeScopes.get(id);
		return (
			isComponentTag(node) &&
			['Identifier', 'JSXIdentifier'].includes(id?.type) &&
			scope !== undefined &&
			lexical.resolveBinding(scope, id.name)?.scope === lexical.rootScope
		);
	};
	const allowed = new Set(),
		forwarding = new Map(),
		invalid = new Set();
	// A bare body call must not change an authored receiver or expose the
	// donated scope through JavaScript's argument list. Arrows inherit these;
	// nested ordinary functions own their own receiver and arguments instead.
	const frameIndependent = new Map();
	function canShareFrame(target) {
		if (frameIndependent.has(target)) return frameIndependent.get(target);
		let safe = target.params.length <= 1;
		function visit(node, parent, key) {
			if (!safe || node === null || typeof node !== 'object') return;
			if (
				node !== target &&
				(node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression')
			)
				return;
			if (
				node.type === 'ThisExpression' ||
				(node.type === 'Identifier' &&
					node.name === 'arguments' &&
					isIdentifierReference(node, parent, key, lexical))
			) {
				safe = false;
				return;
			}
			forEachRuntimeAstChild(node, (child, childKey) => visit(child, node, childKey));
		}
		visit(target);
		frameIndependent.set(target, safe);
		return safe;
	}
	for (const [name, wrapper] of wrappers) {
		forwarding.set(wrapper.call, wrapper);
		const target = declarations.get(wrapper.target);
		if (
			duplicates.has(name) ||
			duplicates.has(wrapper.target) ||
			reassigned.has(wrapper.node.id) ||
			!rootTag(wrapper.call) ||
			!isVoidJsxCodeBlockFunction(target) ||
			reassigned.has(target.id) ||
			!canShareFrame(target)
		)
			invalid.add(wrapper);
	}
	function scanTemplate(node) {
		if (node?.type === 'JSXForExpression') {
			for (const statement of node.body?.body ?? []) scanTemplate(statement);
			for (const statement of node.empty?.body ?? []) scanTemplate(statement);
			return;
		}
		if (!element(node)) return;
		if (rootTag(node) && wrappers.has(tag(node).name)) allowed.add(node);
		else if (!isComponentTag(node)) for (const child of node.children ?? []) scanTemplate(child);
	}
	let moduleVeto = false;
	mapAst(ast, (node) => {
		if (node.type === 'JSXCodeBlock') scanTemplate(node.render);
		if (
			node.type === 'WithStatement' ||
			node.type === 'JSXStyleElement' ||
			node.css ||
			(element(node) && tag(node)?.name === 'style')
		)
			moduleVeto = true;
		return null;
	});
	if (moduleVeto) return ast;
	const escaped = collectFreeIdentifiers(ast.body, [], allowed);
	for (const site of allowed) {
		// Ignoring the call must not hide a wrapper passed as an attribute/child.
		for (const name of collectFreeIdentifiers([attrs(site), site.children], [], allowed))
			escaped.add(name);
		const wrapper = wrappers.get(tag(site).name);
		wrapper.incoming++;
		if (forwarding.has(site)) continue;
		const names = new Set();
		if ((site.children?.length ?? 0) !== 0) invalid.add(wrapper);
		for (const attribute of attrs(site)) {
			const name = attribute.name?.name ?? attribute.name;
			if (
				!['Attribute', 'JSXAttribute'].includes(attribute.type) ||
				typeof name !== 'string' ||
				['key', 'ref', 'children', '__proto__'].includes(name) ||
				names.has(name)
			)
				invalid.add(wrapper);
			names.add(name);
		}
	}
	for (const [name, wrapper] of wrappers) {
		if (
			wrapper.incoming === 0 ||
			escaped.has(name) ||
			collectFreeIdentifiers(wrapper.node.body, [], allowed).has(name)
		)
			invalid.add(wrapper);
	}
	// A forwarding cycle has no terminal body to delegate to. Walk each edge at
	// most once, independently of the bounded call-site substitution below.
	const checked = new Map();
	for (const wrapper of wrappers.values()) {
		const path = new Set();
		let current = wrapper;
		while (current !== undefined && !checked.has(current)) {
			if (path.has(current)) break;
			path.add(current);
			current = wrappers.get(current.target);
		}
		const cyclic = current !== undefined && (path.has(current) || checked.get(current) === true);
		for (const entry of path) {
			checked.set(entry, cyclic);
			if (cyclic) invalid.add(entry);
		}
	}
	// An escaped/unsafe wrapper can forward an arbitrary record to the next
	// wrapper. Fresh direct callers cannot repair that invalid incoming edge.
	const queue = [...invalid];
	for (let index = 0; index < queue.length; index++) {
		const next = wrappers.get(queue[index].target);
		if (next !== undefined && !invalid.has(next)) {
			invalid.add(next);
			queue.push(next);
		}
	}
	const siteLocation = (node) => ({
		start: node.start,
		end: node.end,
		line: node.loc?.start.line ?? null,
		column: node.loc?.start.column ?? null,
	});
	const origin = (wrapper) => ({
		component: wrapper.target,
		file: filename,
		call: siteLocation(wrapper.call),
		definition: siteLocation(declarations.get(wrapper.target)),
	});
	// Share a linked path so graph analysis remains linear. Cap each emitted
	// substitution at 16 skipped owners; longer entries retain their body and
	// can still use a bounded suffix at an inner call site.
	const resolved = new Map();
	for (const wrapper of wrappers.values()) {
		if (invalid.has(wrapper) || resolved.has(wrapper)) continue;
		const path = [];
		let current = wrapper;
		while (!resolved.has(current)) {
			path.push(current);
			const next = wrappers.get(current.target);
			if (next === undefined || invalid.has(next)) break;
			current = next;
		}
		let next = resolved.get(current) ?? null;
		for (let index = path.length - 1; index >= 0; index--) {
			const entry = path[index];
			next = {
				target: next?.target ?? entry.target,
				depth: (next?.depth ?? 0) + 1,
				site: componentInvocationSite({ filename }, entry.call),
				origin: origin(entry),
				next,
			};
			resolved.set(entry, next);
		}
	}
	const rewritten = mapAst(ast, (node) => {
		const wrapper = node.type === 'FunctionDeclaration' && wrappers.get(node.id?.name);
		if (!wrapper || wrapper.node !== node || invalid.has(wrapper)) return null;
		const delegation = resolved.get(wrapper);
		if (delegation.depth > 16) return null;
		return {
			...node,
			// Metadata is not traversed as syntax: shared path tails must not
			// turn subsequent AST walks into repeated graph traversals.
			metadata: { ...node.metadata, octaneLocalDelegation: delegation },
		};
	});
	return rewritten === ast ? ast : { ...rewritten, _octaneHasTemplateFusion: true };
}

// Inline static private component output before template planning. Retain the
// caller's entry component and let the existing planner own slots and cloning.
// Shared compiler primitives keep this pass copy-on-write on the adopted AST.
export function fuseStaticLocalComponentTemplates(ast, filename, tools) {
	const {
		mapAst,
		cloneAstNode,
		collectFreeIdentifiers,
		collectReassignedBindings,
		createLexicalAnalysis,
		inheritOriginLoc,
		isComponentTag,
		unwrapTsExpr,
		hasInlineMemoDirectEval,
		componentHasEarlyReference,
	} = tools;
	const hosts = new Set(['div', 'span', 'em', 'strong', 'section']);
	const skipKeys = new Set([
		'loc',
		'start',
		'end',
		'parent',
		'metadata',
		'css',
		'leadingComments',
		'trailingComments',
	]);
	const declarations = new Map(),
		entries = new Set();
	let hasStringParameters = false;
	const children = (node) => node.children || [];
	const attrs = (node) => node.attributes || node.openingElement?.attributes || [];
	const tag = (node) => node.openingElement?.name || node.id;
	const tagName = (node) =>
		['Identifier', 'JSXIdentifier'].includes(tag(node)?.type) ? tag(node).name : null;
	const element = (node) => node?.type === 'Element' || node?.type === 'JSXElement';
	const attrName = (node) => node.name?.name ?? node.name;
	const unwrap = (node) =>
		unwrapTsExpr(node?.type === 'JSXExpressionContainer' ? node.expression : node);
	function walk(node, visit, seen = new WeakSet()) {
		if (node === null || typeof node !== 'object' || seen.has(node)) return;
		seen.add(node);
		if (Array.isArray(node)) {
			for (const child of node) walk(child, visit, seen);
			return;
		}
		visit(node);
		for (const key of Object.keys(node)) if (!skipKeys.has(key)) walk(node[key], visit, seen);
	}
	for (const statement of ast.body) {
		const node =
			statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration'
				? statement.declaration
				: statement;
		if (
			node?.type !== 'FunctionDeclaration' ||
			node.id?.type !== 'Identifier' ||
			node.async ||
			node.generator ||
			node.body?.type !== 'JSXCodeBlock' ||
			(node.body.body?.length ?? 0) !== 0 ||
			!element(node.body.render) ||
			node.params.length > 1
		)
			continue;
		const parameter = node.params[0];
		if (parameter && parameter.type !== 'Identifier' && parameter.type !== 'ObjectPattern')
			continue;
		if (
			parameter?.type === 'ObjectPattern' &&
			parameter.properties.some(
				(property) =>
					property.type !== 'Property' ||
					property.computed ||
					property.method ||
					property.kind !== 'init' ||
					property.value.type !== 'Identifier' ||
					!['Identifier', 'Literal'].includes(property.key.type) ||
					(property.key.name ?? property.key.value) === '__proto__',
			)
		)
			continue;
		// Entries keep their callable/export identity. Only private host bodies
		// may disappear at a callsite; an entry can itself render that child.
		const componentRoot = isComponentTag(node.body.render);
		// Destructuring can read inherited getters that own hooks. Turning a
		// component-root entry into Lite would schedule those hooks on its parent.
		// Existing host entries keep their original classification; a new entry
		// needs no parameter reads until those reads have an own-data proof.
		if (!componentRoot || parameter?.type !== 'ObjectPattern') entries.add(node);
		if (statement !== node || !hosts.has(tagName(node.body.render)) || componentRoot) continue;
		declarations.set(node.id.name, node);
		if (parameter?.type === 'ObjectPattern') hasStringParameters = true;
	}
	if (declarations.size === 0) return ast;
	let styled = false,
		hasWith = false,
		armSites;
	walk(ast, (node) => {
		if (node.type === 'JSXStyleElement' || node.css || (element(node) && tagName(node) === 'style'))
			styled = true;
		if (node.type === 'WithStatement') hasWith = true;
		if (node._octaneBindingSite || typeof componentHasEarlyReference !== 'function') return;
		const arms =
			node.type === 'JSXIfExpression'
				? [node.consequent, node.alternate].map((arm) =>
						arm?.type === 'BlockStatement' ? arm.body : null,
					)
				: node.type === 'JSXSwitchExpression'
					? node.cases.map((arm) => arm.consequent)
					: null;
		if (arms === null) return;
		for (const arm of arms) {
			if (arm?.length !== 1) continue;
			const call = arm[0];
			if (!element(call) || !isComponentTag(call)) continue;
			const target = declarations.get(tagName(call)),
				parameter = target?.params[0];
			if (
				!target ||
				target.export ||
				target.default ||
				target._octaneBindingView ||
				target._octanePresentationHydration ||
				target._octaneScalarBindingClaims ||
				(parameter &&
					(parameter.type !== 'Identifier' ||
						['this', '__s', '__extra'].includes(parameter.name))) ||
				call._octaneBindingSite ||
				call.openingElement?._octaneBindingSite ||
				attrs(call).length !== 0 ||
				children(call).length !== 0
			)
				continue;
			(armSites ??= new Map()).set(call, target);
		}
	});
	// A single private host can supply a static arm body without a second entry
	// to fuse. Most modules still stop before any binding analysis.
	if (entries.size < 2 && armSites === undefined) return ast;
	// Eval can observe/reassign otherwise private bindings, including through
	// TypeScript wrappers. Reuse the compiler's shared direct-eval analysis.
	if (
		styled ||
		hasWith ||
		hasInlineMemoDirectEval(ast) ||
		ast.body.some(
			(node) =>
				node.type === 'ImportDeclaration' &&
				(node.source.value === 'server' ||
					/^octane\/(signals|react)(\/|$)/.test(node.source.value)),
		)
	)
		return ast;
	const reassigned = collectReassignedBindings(ast);
	for (const [name, node] of declarations) if (reassigned.has(node.id)) declarations.delete(name);
	for (const node of entries) if (reassigned.has(node.id)) entries.delete(node);
	if (declarations.size === 0 || (entries.size < 2 && armSites === undefined)) return ast;
	const lexical = createLexicalAnalysis(ast);
	const ownTag = (node) => {
		const id = tag(node),
			name = tagName(node);
		const scope = id && lexical.nodeScopes.get(id);
		return (
			isComponentTag(node) &&
			scope !== undefined &&
			declarations.has(name) &&
			lexical.resolveBinding(scope, name)?.scope === lexical.rootScope
		);
	};
	const allowed = new Set();
	function scanTemplate(node) {
		// Admission is wider than the region we rewrite: an entry component may
		// be rendered under an ordinary host/@for owned by an unchanged caller.
		// Only direct directive output is visited; expressions/props remain escapes.
		if (node?.type === 'JSXForExpression') {
			for (const statement of node.body?.body ?? []) scanTemplate(statement);
			for (const statement of node.empty?.body ?? []) scanTemplate(statement);
			return;
		}
		if (!element(node)) return;
		if (ownTag(node) && children(node).length === 0) allowed.add(node);
		else if (!isComponentTag(node)) for (const child of children(node)) scanTemplate(child);
	}
	walk(ast, (node) => {
		if (node.type === 'JSXCodeBlock') scanTemplate(node.render);
	});
	let readSafety;
	function canReadArmTarget(site, target) {
		if (readSafety === undefined) {
			const order = new Map(),
				owners = new Map(),
				names = new Set(),
				duplicates = new Set();
			for (const [index, statement] of ast.body.entries()) {
				const owner = statement.declaration ?? statement;
				if (owner.type !== 'FunctionDeclaration' || owner.id?.type !== 'Identifier') continue;
				order.set(owner, index);
				if (names.has(owner.id.name)) duplicates.add(owner.id.name);
				names.add(owner.id.name);
				const scope = lexical.nodeScopes.get(owner.body)?.functionScope;
				if (owner.body?.type === 'JSXCodeBlock' && scope !== undefined) owners.set(scope, owner);
			}
			readSafety = { order, owners, duplicates };
		}
		if (readSafety.duplicates.has(target.id.name)) return false;
		if (componentHasEarlyReference(target)) return true;
		const scope = lexical.nodeScopes.get(tag(site))?.functionScope;
		const owner = scope === undefined ? undefined : readSafety.owners.get(scope);
		// A const-emitted owner can only expose this eager body reference after
		// an earlier target initialized. Otherwise retain the helper's deferred
		// lookup, including unselected arms and a pending owner's skipped replay.
		return (
			owner !== undefined &&
			owner._octaneDirectCallTwin !== true &&
			!readSafety.duplicates.has(owner.id.name) &&
			!reassigned.has(owner.id) &&
			!componentHasEarlyReference(owner) &&
			readSafety.order.get(target) < readSafety.order.get(owner)
		);
	}
	let armTargets,
		ignored = allowed;
	if (armSites !== undefined) {
		armTargets = new Set();
		for (const [site, target] of armSites) {
			if (!ownTag(site) || !canReadArmTarget(site, target)) {
				armSites.delete(site);
				continue;
			}
			if (ignored === allowed) ignored = new Set(allowed);
			ignored.add(site);
			armTargets.add(target);
		}
	}
	const escaped = collectFreeIdentifiers(ast.body, [], ignored);
	for (const site of allowed) {
		// Ignoring a tag must not hide a function escaping through one of its props.
		for (const name of collectFreeIdentifiers(attrs(site), [], allowed)) escaped.add(name);
	}
	for (const [name, node] of declarations) {
		const unsafe = escaped.has(name) || collectFreeIdentifiers(node.body, [], allowed).has(name);
		if (unsafe) armTargets?.delete(node);
		// Arm tags were escapes in the original fusion pass. Restore that fact
		// for its expansion graph; admitting an arm must not enable other fusion.
		if (unsafe || armTargets?.has(node)) declarations.delete(name);
	}
	// Props at these sites are fresh data records. A template literal evaluates
	// its coercion at the authored outer call and can only deliver a primitive
	// string. Intersect every exact lexical callsite; types alone prove nothing.
	const incomingStrings = hasStringParameters ? new Map() : null;
	if (incomingStrings !== null) {
		for (const site of allowed) {
			const name = tagName(site);
			if (declarations.get(name)?.params[0]?.type !== 'ObjectPattern') continue;
			const fields = new Set(),
				seen = new Set();
			for (const attribute of attrs(site)) {
				const key = attrName(attribute);
				if (
					!['Attribute', 'JSXAttribute'].includes(attribute.type) ||
					typeof key !== 'string' ||
					['key', 'ref', 'children', '__proto__'].includes(key) ||
					seen.has(key)
				) {
					fields.clear();
					break;
				}
				seen.add(key);
				const value = unwrap(attribute.value);
				if (
					value?.type === 'TemplateLiteral' ||
					(['Literal', 'StringLiteral'].includes(value?.type) && typeof value.value === 'string')
				)
					fields.add(key);
			}
			const previous = incomingStrings.get(name);
			if (previous === undefined) incomingStrings.set(name, fields);
			else for (const key of previous) if (!fields.has(key)) previous.delete(key);
		}
	}
	const stringValue = (node, env) => {
		node = unwrap(node);
		if (node?.type === 'Identifier') return env.get(node.name) ?? null;
		if (
			node?.type === 'MemberExpression' &&
			!node.computed &&
			!node.optional &&
			node.object.type === 'Identifier'
		)
			return env.get(node.object.name + '.' + node.property.name) ?? null;
		// String-only in this first pass: erasing a boolean/null cast could turn
		// an explicit text child into an empty renderable child.
		// A runtime property/text write preserves CR and NUL; parsing the same
		// value as template HTML normalizes them. Keep the authored call instead.
		if (
			['Literal', 'StringLiteral'].includes(node?.type) &&
			typeof node.value === 'string' &&
			!node.value.includes('\r') &&
			!node.value.includes('\0')
		)
			return node;
		return null;
	};
	const substitute = (node, env) => {
		const value = stringValue(node, env);
		if (value === null) return null;
		const original = unwrap(node);
		const replacement = inheritOriginLoc(cloneAstNode(value), original);
		if (typeof unwrap(value).value === 'string') return replacement;
		// Preserve the authored text coercion and child-only type proof. Dropping
		// an `as string` could turn an empty Text binding into an absent child.
		const expression = node.type === 'JSXExpressionContainer' ? node.expression : node;
		return mapAst(expression, (part) => (part === original ? replacement : null));
	};
	const staticText = (node) => {
		const value = unwrap(node);
		return typeof value?.value === 'string' ? value.value : null;
	};
	const siteLocation = (node) => ({
		start: node.start,
		end: node.end,
		line: node.loc?.start.line ?? null,
		column: node.loc?.start.column ?? null,
	});
	function chargeText(budget, value) {
		budget.codeUnits -= value.length;
		return budget.codeUnits >= 0;
	}
	function expand(node, env, trail, budget) {
		if (--budget.left < 0) return null;
		if (node?.type === 'JSXText') return chargeText(budget, node.value) ? cloneAstNode(node) : null;
		if (node?.type === 'Text' || node?.type === 'JSXExpressionContainer') {
			const expression = substitute(node.expression, env);
			// Baking an empty runtime text binding would remove its Text node.
			return expression === null ||
				staticText(expression) === '' ||
				!chargeText(budget, staticText(expression) ?? '')
				? null
				: { ...cloneAstNode(node), expression };
		}
		if (!element(node)) return null;
		const name = tagName(node);
		if (isComponentTag(node) && declarations.has(name)) {
			if (!allowed.has(node) || trail.some((site) => site.component === name) || trail.length >= 16)
				return null;
			const declaration = declarations.get(name),
				values = new Map();
			for (const attribute of attrs(node)) {
				const key = attrName(attribute);
				if (
					!['Attribute', 'JSXAttribute'].includes(attribute.type) ||
					typeof key !== 'string' ||
					['key', 'ref', 'children', '__proto__'].includes(key) ||
					values.has(key)
				)
					return null;
				if (attribute.value == null) return null;
				const value = substitute(attribute.value, env);
				if (value === null) return null;
				values.set(key, value);
			}
			const parameter = declaration.params[0],
				inner = new Map();
			if (parameter?.type === 'Identifier')
				for (const [key, value] of values) inner.set(parameter.name + '.' + key, value);
			if (parameter?.type === 'ObjectPattern')
				for (const property of parameter.properties) {
					const value = values.get(property.key.name ?? property.key.value);
					if (value === undefined) return null; // Never introduce an inherited missing-field read.
					inner.set(property.value.name, value);
				}
			const site = {
				component: name,
				file: filename,
				call: siteLocation(node),
				definition: siteLocation(declaration),
			};
			const result = expand(declaration.body.render, inner, [...trail, site], budget);
			if (result === null) return null;
			return { ...result, _octaneFusionOrigins: [site, ...(result._octaneFusionOrigins ?? [])] };
		}
		if (!hosts.has(name)) return null;
		const attributes = [];
		for (const attribute of attrs(node)) {
			const key = attrName(attribute);
			if (
				!['Attribute', 'JSXAttribute'].includes(attribute.type) ||
				typeof key !== 'string' ||
				!(
					key === 'class' ||
					key === 'className' ||
					key === 'id' ||
					key === 'title' ||
					key.startsWith('data-') ||
					key.startsWith('aria-')
				)
			)
				return null;
			if (attribute.value == null) return null;
			const value = substitute(attribute.value, env);
			if (value === null) return null;
			if (!chargeText(budget, key) || !chargeText(budget, staticText(value) ?? '')) return null;
			attributes.push({
				...cloneAstNode(attribute),
				value:
					attribute.value?.type === 'JSXExpressionContainer'
						? { ...cloneAstNode(attribute.value), expression: value }
						: value,
			});
		}
		const output = [];
		const childNodes = children(node);
		for (const child of childNodes) {
			const value = expand(child, env, trail, budget);
			if (value === null) return null;
			// A baked text run merges with adjacent text in the HTML parser. Keep
			// its boundary; dynamic bindings retain their own Text nodes instead.
			if (
				(child.type === 'Text' || child.type === 'JSXExpressionContainer') &&
				childNodes.length !== 1 &&
				staticText(value.expression) !== null
			)
				return null;
			output.push(value);
		}
		const copy = cloneAstNode(node);
		if (copy.openingElement) copy.openingElement = { ...copy.openingElement, attributes };
		if (copy.attributes) copy.attributes = attributes;
		return { ...copy, children: output };
	}
	const replacements = new Map(),
		closedArms = armTargets?.size ? new Set() : null;
	for (const node of entries) {
		// Keep the entry's callable/export identity. The expanded pure body can
		// use the compiler's ordinary Lite/singleRoot classification. Input facts
		// belong only to private, non-escaping declarations: exported/escaped
		// entries may receive arbitrary props from callers outside this module.
		const env = new Map();
		const fields =
			declarations.get(node.id.name) === node ? incomingStrings?.get(node.id.name) : undefined;
		if (fields !== undefined) {
			for (const property of node.params[0].properties) {
				if (fields.has(property.key.name ?? property.key.value))
					env.set(property.value.name, property.value);
			}
		}
		// Bound each expanded occurrence, not just unique literals: different
		// parent prefixes cannot share an interned template containing a large leaf.
		const render = expand(node.body.render, env, [], { left: 256, codeUnits: 8192 });
		if (render === null) continue;
		let fused = false;
		walk(render, (part) => {
			if (part._octaneFusionOrigins) fused = true;
		});
		if (fused) replacements.set(node, { ...node, body: { ...node.body, render } });
		// Only the actual adopted expansion (or unchanged closed leaf) can run
		// as a generic arm. Empty-env proof excludes props reads and latent work.
		if (armTargets?.has(node) && env.size === 0) closedArms.add(node);
	}
	if (replacements.size === 0 && !closedArms?.size) return ast;
	const rewritten = mapAst(ast, (node) => {
		const replacement = replacements.get(node);
		if (replacement) return replacement;
		const target = armSites?.get(node);
		if (!target || !closedArms?.has(target)) return null;
		const opening = node.openingElement ?? node;
		const marked = {
			...opening,
			metadata: {
				...opening.metadata,
				octaneStaticArm: {
					component: target.id.name,
					file: filename,
					call: siteLocation(node),
					definition: siteLocation(target),
				},
			},
		};
		return node.openingElement ? { ...node, openingElement: marked } : marked;
	});
	return rewritten === ast ? ast : { ...rewritten, _octaneHasTemplateFusion: true };
}

// Collect only the host nodes represented by this particular template. A nested
// directive or component body belongs to a different plan and is not traversed.
export function templateFusionOrigins(nodes) {
	const found = [],
		seen = new Set();
	function visit(node) {
		if (!node || (node.type !== 'Element' && node.type !== 'JSXElement')) return;
		for (const item of node._octaneFusionOrigins ?? []) {
			const key = `${item.component}:${item.call.start}:${item.call.end}`;
			if (!seen.has(key)) {
				seen.add(key);
				found.push(item);
			}
		}
		for (const child of node.children ?? []) visit(child);
	}
	for (const node of nodes) visit(node);
	return found;
}

export function annotateTemplateFusion(node, origins, sharedRegion) {
	if (!origins?.length) return node;
	const text = origins
		.map(
			(item) =>
				`${item.component} (${item.file}:${item.definition.line}:${item.definition.column}; call ${item.call.line}:${item.call.column})`,
		)
		.join('; ')
		.replaceAll('*/', '* /')
		.replaceAll('\n', ' ');
	return {
		...node,
		__octaneFusionLeading: [
			{
				type: 'Block',
				value: ` octane-inline START shared ${sharedRegion}: ${text} `,
				start: node.start,
				end: node.end,
				loc: node.loc,
			},
		],
		__octaneFusionTrailing: [
			{
				type: 'Block',
				value: ` octane-inline END shared ${sharedRegion}: ${text} `,
				start: node.start,
				end: node.end,
				loc: node.loc,
			},
		],
	};
}

// The SSR printer owns renderer statements rather than client template data.
// Label the generated statement range as shared; do not pretend it is one
// contiguous child-owned region or add markers to the rendered HTML.
export function annotateFusionRenderer(statements, first, authoredNode) {
	const component = authoredNode.declaration ?? authoredNode;
	const origins = templateFusionOrigins([component.body?.render]);
	if (origins.length === 0 || first === statements.length) return;
	const last = statements.length - 1;
	const annotated = annotateTemplateFusion(statements[first], origins, 'renderer region');
	statements[first] = {
		...statements[first],
		__octaneFusionLeading: annotated.__octaneFusionLeading,
	};
	statements[last] = {
		...statements[last],
		__octaneFusionTrailing: annotated.__octaneFusionTrailing,
	};
}

export function mergeTemplateFusionOrigins(template, next) {
	if (!template.fusionOrigins?.length) {
		template.fusionOrigins = next;
		return;
	}
	const keyOf = (item) => `${item.file}:${item.component}:${item.call.start}:${item.call.end}`;
	// This list belongs to the planned template, not the adopted AST. Keep one
	// lookup per shared template so N contributing callers do not cause N² scans.
	const keys = (template.fusionOriginKeys ??= new Set(template.fusionOrigins.map(keyOf)));
	for (const item of next) {
		const key = keyOf(item);
		if (!keys.has(key)) {
			keys.add(key);
			template.fusionOrigins.push(item);
		}
	}
}
