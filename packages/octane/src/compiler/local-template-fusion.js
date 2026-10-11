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
	const declarations = new Map();
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
	for (const node of ast.body) {
		if (
			node.type !== 'FunctionDeclaration' ||
			node.id?.type !== 'Identifier' ||
			node.async ||
			node.generator ||
			node.body?.type !== 'JSXCodeBlock' ||
			(node.body.body?.length ?? 0) !== 0 ||
			!element(node.body.render) ||
			!hosts.has(tagName(node.body.render)) ||
			isComponentTag(node.body.render) ||
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
		declarations.set(node.id.name, node);
	}
	// A private caller and a distinct private child are needed. Most modules
	// cannot qualify; avoid full lexical analysis until this cheap check passes.
	if (declarations.size < 2) return ast;
	let styled = false,
		hasWith = false;
	walk(ast, (node) => {
		if (node.type === 'JSXStyleElement' || node.css || (element(node) && tagName(node) === 'style'))
			styled = true;
		if (node.type === 'WithStatement') hasWith = true;
	});
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
	if (declarations.size < 2) return ast;
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
	const escaped = collectFreeIdentifiers(ast.body, [], allowed);
	for (const site of allowed) {
		// Ignoring a tag must not hide a function escaping through one of its props.
		for (const name of collectFreeIdentifiers(attrs(site), [], allowed)) escaped.add(name);
	}
	for (const [name, node] of declarations) {
		if (escaped.has(name) || collectFreeIdentifiers(node.body, [], allowed).has(name))
			declarations.delete(name);
	}
	const literal = (node, env) => {
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
		const value = literal(node, env);
		return value === null ? null : inheritOriginLoc(cloneAstNode(value), unwrap(node));
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
			return expression === null || expression.value === '' || !chargeText(budget, expression.value)
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
			if (!chargeText(budget, key) || !chargeText(budget, value.value)) return null;
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
			// A baked text run merges with adjacent text in the HTML parser. Keep
			// authored calls unless the bound text is the host's only child.
			if (
				(child.type === 'Text' || child.type === 'JSXExpressionContainer') &&
				childNodes.length !== 1
			)
				return null;
			const value = expand(child, env, trail, budget);
			if (value === null) return null;
			output.push(value);
		}
		const copy = cloneAstNode(node);
		if (copy.openingElement) copy.openingElement = { ...copy.openingElement, attributes };
		if (copy.attributes) copy.attributes = attributes;
		return { ...copy, children: output };
	}
	const rewritten = mapAst(ast, (node) => {
		// Keep the authored caller -> entry component boundary. Final owner/memo
		// classification is still a codegen and behavioral qualification gate.
		// Only rewrite a private component's own complete, proven-static body.
		if (node.type !== 'FunctionDeclaration' || declarations.get(node.id?.name) !== node)
			return null;
		// Bound each expanded occurrence, not just unique literals: different
		// parent prefixes cannot share an interned template containing a large leaf.
		const render = expand(node.body.render, new Map(), [], { left: 256, codeUnits: 8192 });
		if (render === null) return null;
		let fused = false;
		walk(render, (part) => {
			if (part._octaneFusionOrigins) fused = true;
		});
		return fused ? { ...node, body: { ...node.body, render } } : null;
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
			{ type: 'Block', value: ` octane-inline START shared ${sharedRegion}: ${text} ` },
		],
		__octaneFusionTrailing: [
			{ type: 'Block', value: ` octane-inline END shared ${sharedRegion}: ${text} ` },
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
