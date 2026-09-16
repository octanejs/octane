/** Compiler-owned presentation programs; authored views never execute in the browser. */
import { builders as b, strongHash } from '@tsrx/core';
import { inheritHookMemoOrigin as origin } from './inline-hook-memo.js';
import {
	createTemplateIr,
	appendTemplatePart,
	appendTemplateIr,
	templateElement,
	serializeTemplateIr,
} from './template-ir.js';
import {
	ATTRIBUTE_ALIASES,
	BOOLEAN_ATTR_PROPS,
	VOID_ELEMENTS,
	hyphenateStyleName,
	isEnumeratedBooleanAttr,
	isUnitlessStyleProp,
} from '../dom-tables.js';
import { shouldSanitizeURLAttribute } from '../sanitize-url.js';
import { formatDomBindingRequest } from './dom-binding-request.js';

function unwrap(node) {
	while (
		[
			'TSAsExpression',
			'TSTypeAssertion',
			'TSNonNullExpression',
			'TSSatisfiesExpression',
			'ParenthesizedExpression',
		].includes(node?.type)
	)
		node = node.expression;
	return node;
}

function tagOf(node) {
	return node.openingElement?.name?.name ?? node.id?.name;
}

function significant(node) {
	return (
		node &&
		!(
			node.type === 'JSXText' &&
			(node.value === '' || (/^\s*$/.test(node.value) && /[\r\n]/.test(node.value)))
		) &&
		!(node.type === 'JSXExpressionContainer' && node.expression?.type === 'JSXEmptyExpression')
	);
}

export function needsBindingProgram(node, isUnbound) {
	if (!significant(node)) return false;
	if (node.type === 'JSXExpressionContainer' && isUnbound(node.expression)) return false;
	if (node.type !== 'JSXElement' && node.type !== 'Element') return true;
	if (!/^[a-z]/.test(tagOf(node) ?? '')) return true;
	if (
		(node.openingElement?.attributes ?? node.attributes ?? []).some(
			(attr) => rawName(attr) === 'ref' || /^on[A-Z]/.test(rawName(attr) ?? ''),
		)
	)
		return true;
	if (tagOf(node) === 'textarea') return false;
	return (node.children ?? []).some((child) => needsBindingProgram(child, isUnbound));
}

function data(value) {
	return Array.isArray(value) ? b.array(value.map(data)) : b.literal(value);
}

function object(properties) {
	return b.object(
		Object.entries(properties).map(([name, value]) => b.prop('init', b.id(name), value)),
	);
}

function rawName(attr) {
	return attr.name?.type === 'JSXNamespacedName'
		? `${attr.name.namespace.name}:${attr.name.name.name}`
		: (attr.name?.name ?? attr.name);
}

function attrValue(attr) {
	return attr.value === null
		? b.literal(true)
		: attr.value?.type === 'JSXExpressionContainer'
			? attr.value.expression
			: attr.value;
}

function blockNodes(node) {
	return node == null ? [] : node.type === 'BlockStatement' ? node.body : [node];
}

/** Build AST only. The owning compiler prints the completed module once. */
export function planBindingProgram(fn, render, context) {
	const {
		source,
		filename,
		helpers,
		isUnbound,
		nativePlan,
		assertProjection,
		assertAdapter,
		mapCow,
		imports,
		lexical,
		localProgram,
		allocateProgramName,
		projectionBody,
		parameterNames,
		refDependencies,
		canCarryValue,
		isChildSlot,
	} = context;
	const id = `d:${strongHash(`octane:dom-bindings:2\0${filename}\0${fn.id.name}\0${source}`)}`;
	const replacements = new Map();
	const unbound = new Map();
	const classAttributes = new Map();
	const restAttributes = new Map();
	const dependencies = [];
	const hoists = [];
	const expressions = [];
	const importedPrograms = new Map();
	const childPrograms = new Set();
	let activationHelper = null;
	let classFactory = null;
	let methodDependency = null;
	let slotFactory = null;
	let signals = false;
	let controls = false;
	let styles = false;
	let projectionsEnabled = false;
	let nextSite = 0;
	const fail = (node, message) => {
		const error = new Error(
			`Octane DOM bindings (${filename}:${node?.loc?.start?.line ?? 1}): ${message}`,
		);
		error.code = 'OCTANE_DOM_BINDINGS';
		throw error;
	};
	const metadata = () => ({ id, site: nextSite++ });
	const stripUnbound = (expression) => {
		const call = unwrap(expression);
		if (call.arguments.length !== 1 || call.arguments[0].type === 'SpreadElement' || call.optional)
			fail(call, 'unbound requires one externally owned value');
		unbound.set(call, call.arguments[0]);
		return call.arguments[0];
	};
	const annotate = (node, nativeChild = false) => {
		if (!node || typeof node !== 'object') return node;
		if (Array.isArray(node)) return node.map((child) => annotate(child, nativeChild));
		let next = node;
		if (node.type === 'JSXExpressionContainer') {
			if (isUnbound(node.expression)) {
				stripUnbound(node.expression);
				next = { ...node, _octaneBindingOpaque: metadata() };
			} else if (nativeChild && helpers.conditionalJsxStatement(node.expression)) {
				next = {
					...node,
					expression: {
						...node.expression,
						_octaneBindingSite: metadata(),
						consequent: annotate(node.expression.consequent),
						alternate: annotate(node.expression.alternate),
					},
				};
			} else if (isChildSlot(node.expression)) {
				next = { ...node, _octaneBindingSlot: metadata() };
			} else if (helpers.isText(node.expression)) {
				next = { ...node, _octaneBindingText: metadata() };
			} else if (canCarryValue(node.expression)) {
				next = { ...node, _octaneBindingValue: metadata() };
			}
		} else if (node.type === 'JSXElement' || node.type === 'Element') {
			const native = /^[a-z]/.test(tagOf(node) ?? '');
			if (context.annotationsOnly) {
				const attributes = node.openingElement?.attributes ?? node.attributes ?? [];
				if (
					attributes.some((attribute) => ['class', 'className'].includes(rawName(attribute))) &&
					attributes.some((attribute) =>
						attribute._octaneKnownAttributeSpread?.fields.some((name) =>
							['class', 'className'].includes(name),
						),
					)
				)
					fail(
						node,
						'generic binding rest annotations cannot combine class attributes and known spreads',
					);
				for (const attribute of attributes) {
					if (isUnbound(attrValue(attribute))) stripUnbound(attrValue(attribute));
				}
			}
			const children = annotate(node.children ?? [], native);
			next = { ...node, children };
			if (!native) next._octaneBindingSite = metadata();
		} else if (node.type === 'JSXFragment' || node.type === 'Fragment') {
			next = { ...node, children: annotate(node.children ?? []) };
		} else if (node.type === 'JSXIfExpression' || node.type === 'IfStatement') {
			next = {
				...node,
				_octaneBindingSite: metadata(),
				consequent: annotate(node.consequent),
				alternate: annotate(node.alternate),
			};
		} else if (node.type === 'JSXForExpression' || node.type === 'ForOfStatement') {
			next = {
				...node,
				_octaneBindingSite: metadata(),
				body: annotate(node.body),
				empty: annotate(node.empty),
			};
		} else if (node.type === 'BlockStatement') {
			next = { ...node, body: annotate(node.body) };
		} else if (node.type === 'JSXCodeBlock' && node.body.length === 0) {
			next = { ...node, render: annotate(node.render) };
		}
		if (next !== node) replacements.set(node, next);
		return next;
	};
	const annotated = annotate(render);
	const normalize = (nodes, namespace) =>
		helpers.normalizeChildren(nodes, namespace === 1, null, false, false);
	const environment = (names, exclude = []) =>
		b.array_pattern(
			names.map((name, index) =>
				name !== null && !exclude.includes(name) && names.lastIndexOf(name) === index
					? b.id(name)
					: null,
			),
		);
	const project = (names, value, node = fn, temporaries = []) => {
		expressions.push(value);
		return origin(
			b.arrow([environment(names)], projectionBody(value, expressions, temporaries)),
			node,
		);
	};
	const validate = (expression) => {
		if (!context.annotationsOnly) assertProjection(expression);
	};
	const regionMarker = (site, arm) => `<!--[b;${id};${site};${arm}--><!--]-->`;
	const compileFragment = (rawNodes, names, namespace = 0, ancestors = []) => {
		// Only this fragment's writers determine its entry capability. Conditional
		// arms and caller slots are checked when their concrete ranges are entered.
		let structural = true;
		const nodes = [];
		const appendNode = (node) => {
			nodes.push(node);
			if (node[0] >= 0) nodes[node[0]][4]++;
		};
		const bindings = [];
		const values = [];
		const signalIndices = [];
		const styleIndices = [];
		const projectionGroups = [];
		const projections = [];
		const initializers = [];
		const initialValues = [];
		const regions = [];
		const adapters = [];
		const restSites = [];
		let constructionError = null;
		const initialize = (index, kind, name, value, unitless) => {
			validate(value);
			initializers.push([index, kind, name, ...(unitless === undefined ? [] : [unitless])]);
			initialValues.push(value);
		};
		const emit = (node, parent, ns, parents) => {
			if (node.type === 'Text' || node.type === 'TSRXExpression') {
				if (node.expression?._octaneBindingSite) {
					const conditional = helpers.conditionalJsxStatement(node.expression);
					if (conditional) return emit(conditional, parent, ns, parents);
				}
				const opaque = node._octaneBindingOpaque;
				if (opaque) {
					structural = false;
					const index = nodes.length;
					appendNode([parent, 'region', String(opaque.site)]);
					regions.push(object({ node: b.literal(index), kind: b.literal('opaque') }));
					constructionError ??=
						'This view contains externally owned children that cannot be constructed by a binding program.';
					const html = createTemplateIr();
					appendTemplatePart(html, regionMarker(opaque.site, 'o'), 'anchor');
					return html;
				}
				if (node._octaneBindingSlot) {
					validate(node.expression);
					const site = node._octaneBindingSlot.site;
					const index = nodes.length;
					appendNode([parent, 'region', String(site)]);
					regions.push(
						object({
							node: b.literal(index),
							kind: b.literal('slot'),
							read: project(names, node.expression, node),
						}),
					);
					// A caller-owned fragment can acquire direct channels in a later publication.
					signals = true;
					const html = createTemplateIr();
					appendTemplatePart(html, regionMarker(site, 's'), 'anchor');
					return html;
				}
				const value = unwrap(node.expression);
				if (value?.type === 'Literal' && !node._octaneBindingText) {
					const text =
						value.value == null || typeof value.value === 'boolean' ? '' : String(value.value);
					const html = createTemplateIr();
					if (text !== '') {
						const previous = nodes.at(-1);
						if (previous?.[0] === parent && previous[1] === 'text') previous[2] += text;
						else appendNode([parent, 'text', text]);
						appendTemplatePart(html, helpers.escapeHtml(text), 'text');
					}
					return html;
				}
				if (
					!node._octaneBindingValue &&
					(!node._octaneBindingText || !helpers.isText(node.expression))
				)
					fail(
						node.expression ?? node,
						'binding child values must be proven text; use an explicit string cast or unbound external children',
					);
				validate(node.expression);
				const site = (node._octaneBindingText ?? node._octaneBindingValue).site;
				if (node._octaneBindingValue) structural = false;
				const signal = helpers.canCarryDirectSignalHandle(node.expression);
				signals ||= signal;
				const index = nodes.length;
				appendNode([parent, 'region', String(site)]);
				regions.push(
					object({
						node: b.literal(index),
						kind: b.literal('text'),
						read: project(names, node.expression, node),
						...(signal ? { signal: b.literal(true) } : {}),
						...(node._octaneBindingValue ? { generic: b.literal(true) } : {}),
					}),
				);
				const html = createTemplateIr();
				appendTemplatePart(html, regionMarker(site, 't'), 'anchor');
				return html;
			}
			if (node.type === 'IfStatement') {
				validate(node.test);
				const site = node._octaneBindingSite?.site;
				if (site === undefined) fail(node, 'binding condition is missing its authored site');
				const thenNodes = blockNodes(node.consequent);
				const elseNodes = blockNodes(node.alternate);
				const arms = [
					compileFragment(thenNodes, names, ns, parents).fragment,
					compileFragment(elseNodes, names, ns, parents).fragment,
				];
				const index = nodes.length;
				appendNode([parent, 'region', String(site)]);
				regions.push(
					object({
						node: b.literal(index),
						kind: b.literal('if'),
						select: project(
							names,
							b.conditional(
								node.test,
								b.literal(node.consequent ? 0 : -1),
								b.literal(node.alternate ? 1 : -1),
							),
							node,
						),
						arms: b.array(arms),
						armRange: b.literal(
							!(
								helpers.canBorrowSsrHostBranchRange(thenNodes) &&
								helpers.canBorrowSsrHostBranchRange(elseNodes)
							),
						),
					}),
				);
				const html = createTemplateIr();
				appendTemplatePart(html, regionMarker(site, '-1'), 'anchor');
				return html;
			}
			if (node.type === 'ForOfStatement') {
				structural = false;
				const item = node.left?.declarations?.[0]?.id;
				if (node.await || item?.type !== 'Identifier' || !node.key)
					fail(
						node,
						'binding lists require a synchronous @for with one item identifier and an explicit stable key',
					);
				validate(node.right);
				validate(node.key);
				const site = node._octaneBindingSite?.site;
				if (site === undefined) fail(node, 'binding list is missing its authored site');
				const indexName = node.index?.name ?? null;
				const keyIndex = indexName ?? `_bindingIndex${site}`;
				expressions.push(node.key);
				const key = origin(
					b.arrow(
						[b.id(item.name), b.id(keyIndex), environment(names, [item.name, keyIndex])],
						projectionBody(node.key, expressions),
					),
					node,
				);
				const body = compileFragment(
					blockNodes(node.body),
					[...names, item.name, indexName],
					ns,
					parents,
				).fragment;
				const empty = compileFragment(blockNodes(node.empty), names, ns, parents).fragment;
				const index = nodes.length;
				appendNode([parent, 'region', String(site)]);
				regions.push(
					object({
						node: b.literal(index),
						kind: b.literal('for'),
						items: project(names, node.right, node),
						key,
						item: body,
						empty,
					}),
				);
				const html = createTemplateIr();
				appendTemplatePart(html, `<!--[f0;b;${id};${site}--><!--]-->`, 'anchor');
				return html;
			}
			if (node.type !== 'Element') fail(node, `unsupported binding program construct ${node.type}`);
			const tag = tagOf(node);
			if (!/^[a-z]/.test(tag ?? '')) {
				const site = node._octaneBindingSite?.site;
				if (site === undefined) fail(node, 'binding child component is missing its authored site');
				const index = nodes.length;
				appendNode([parent, 'region', String(site)]);
				const html = createTemplateIr();
				appendTemplatePart(html, regionMarker(site, 'v'), 'anchor');
				if (context.annotationsOnly) {
					localProgram(tag, null, true);
					if ((node.children ?? []).some(significant))
						compileFragment(node.children, names, ns, parents);
					return html;
				}
				const props = [];
				const propNames = [];
				for (const attr of node.attributes ?? []) {
					if (attr.type !== 'Attribute' && attr.type !== 'JSXAttribute')
						fail(attr, 'binding child program props must be explicit');
					const name = rawName(attr);
					if (['key', 'children', '__proto__'].includes(name))
						fail(attr, `binding child program ${name} is not supported`);
					if (propNames.includes(name))
						fail(attr, 'binding child program props cannot be repeated');
					const value = attrValue(attr);
					validate(value);
					propNames.push(name);
					props.push(b.prop('init', b.literal(name), value));
				}
				if ((node.children ?? []).some(significant)) propNames.push('children');
				const imported = imports.get(tag);
				const child = !imported ? localProgram(tag, propNames) : null;
				if (
					!child &&
					(!imported?.imported ||
						imported.specifier.type !== 'ImportSpecifier' ||
						/[?#]/.test(imported.source))
				)
					fail(node, 'binding child components must be directly imported named pure binding views');
				const request = child
					? null
					: formatDomBindingRequest(imported.source, {
							exportName: imported.imported,
							mount: true,
							props: propNames,
						});
				let local = importedPrograms.get(request);
				if (local === undefined && !child) {
					local = allocateProgramName('_bindingChild');
					importedPrograms.set(request, local);
					childPrograms.add(local);
					dependencies.push(origin(b.imports([['default', local]], request), node));
				}
				if (child) {
					// Child capability is checked for the entered view instance when the
					// lease is acquired and published, including a changed active branch.
					signals ||= child.signals;
					controls ||= child.controls;
					styles ||= child.styles;
					for (const program of child.childPrograms) childPrograms.add(program);
					for (const dependency of child.dependencies)
						if (!dependencies.includes(dependency)) dependencies.push(dependency);
					for (const hoist of child.hoists) if (!hoists.includes(hoist)) hoists.push(hoist);
					expressions.push(...child.expressions);
				} else signals = true;
				if ((node.children ?? []).some(significant)) {
					const fragment = compileFragment(node.children, names, ns, parents).fragment;
					const local = allocateProgramName('_bindingSlotFragment');
					hoists.push(origin(b.const(b.id(local), fragment), node));
					if (slotFactory === null) {
						slotFactory = allocateProgramName('_bindingSlot');
						dependencies.push(
							origin(
								b.imports([['__bindingSlot', slotFactory]], 'octane/dom-binding-program'),
								node,
							),
						);
					}
					props.push(
						b.prop(
							'init',
							b.id('children'),
							b.call(
								b.id(slotFactory),
								b.literal(id),
								b.id(local),
								b.array(
									names.map((name, index) =>
										name !== null && names.lastIndexOf(name) === index
											? b.id(name)
											: b.unary('void', b.literal(0)),
									),
								),
								b.literal(site),
							),
						),
					);
				}
				regions.push(
					object({
						node: b.literal(index),
						kind: b.literal('view'),
						view: child
							? object({
									id: b.literal(child.id),
									root: child.root,
									...(child.prepareProps ? { prepareProps: child.prepareProps } : {}),
								})
							: b.id(local),
						props: project(names, b.object(props), node),
					}),
				);
				return html;
			}
			const selfNs = tag === 'svg' ? 1 : ns;
			const index = nodes.length;
			for (const rest of context.restSites?.get(node.attributes) ?? []) {
				const { site, spread, keys } = rest;
				// The same normalized fragment allocator supplies descriptor addresses
				// and normal-renderer metadata, including sites inside branches/slots.
				if (keys !== undefined)
					restSites.push(
						object({
							site: b.literal(site),
							node: b.literal(index),
							spread: b.literal(spread),
							keys: data(keys),
						}),
					);
				if (context.annotationsOnly)
					restAttributes.set(rest.attribute, {
						...rest.attribute,
						_octaneBindingRest: { id, site, node: index, spread },
					});
			}
			const nativeAttributes = (node.attributes ?? []).filter((attr) => {
				const name = rawName(attr);
				// Annotation-only compilation shares this fragment's exact normalized
				// node allocation, but needs only partial-class ownership receipts.
				// Other native props remain on the ordinary authored renderer path.
				if (context.annotationsOnly) return name === 'class' || name === 'className';
				if (name !== 'ref' && !/^on[A-Z]/.test(name ?? '')) return true;
				const expression = attrValue(attr);
				// Event/ref callbacks are native owner adapters, not eager projections.
				assertAdapter(expression);
				if (
					name !== 'ref' &&
					![
						'ArrowFunctionExpression',
						'FunctionExpression',
						'MemberExpression',
						'Identifier',
						'Literal',
					].includes(unwrap(expression)?.type)
				)
					fail(attr, 'native event adapters need a callback or callback prop');
				const capture =
					name !== 'ref' &&
					name.endsWith('Capture') &&
					!['onGotPointerCapture', 'onLostPointerCapture'].includes(name);
				const event = capture ? name.slice(2, -7) : name.slice(2);
				const refRecords = name === 'ref' ? refDependencies(expression) : null;
				const refValues = refRecords?.map((record) => {
					if (!record.method) return record.node;
					if (methodDependency === null) {
						methodDependency = allocateProgramName('_bindingMethodDependency');
						dependencies.push(
							origin(
								b.imports([['__methodDep', methodDependency]], 'octane/dom-binding-program'),
								attr,
							),
						);
					}
					return origin(
						b.call(b.id(methodDependency), record.method.root, b.literal(record.method.name)),
						record.node,
					);
				});
				adapters.push(
					object({
						node: b.literal(index),
						kind: b.literal(name === 'ref' ? 'ref' : 'event'),
						...(refValues !== null && refValues !== undefined
							? refValues.length === 0
								? { stable: b.literal(true) }
								: { dependencies: project(names, b.array(refValues), attr) }
							: {}),
						...(name === 'ref'
							? {}
							: {
									name: b.literal(
										event === 'DoubleClick'
											? 'dblclick'
											: event === 'Focus'
												? 'focusin'
												: event === 'Blur'
													? 'focusout'
													: event.toLowerCase(),
									),
									...(capture ? { capture: b.literal(true) } : {}),
								}),
						read: project(names, expression, attr),
					}),
				);
				return false;
			});
			const native = nativePlan(
				{ ...node, openingElement: undefined, attributes: nativeAttributes },
				selfNs,
				parents,
			);
			for (const [attr, replacement] of native.classAttributes) {
				const metadata = {
					...replacement._octaneBindingClassGroups,
					receipt: `data-octane-class-${id}-${index}`,
				};
				native.classAttributes.set(attr, { ...replacement, _octaneBindingClassGroups: metadata });
				const original =
					node.openingElement?.attributes.find(
						(candidate) => rawName(candidate) === rawName(attr),
					) ?? attr;
				classAttributes.set(original, {
					...original,
					_octaneBindingClassGroups: metadata,
				});
			}
			for (const [call, value] of native.unbound) unbound.set(call, value);
			projections.push(...native.projections);
			for (const signalIndex of native.signalIndices)
				signalIndices.push(bindings.length + signalIndex);
			for (const styleIndex of native.styleIndices) styleIndices.push(bindings.length + styleIndex);
			for (const group of native.projectionGroups)
				projectionGroups.push(group.map(([binding, field]) => [bindings.length + binding, field]));
			projectionsEnabled ||= native.projectionGroups.length > 0;
			signals ||= native.signalIndices.length > 0;
			controls ||= native.bindings.some((binding) => binding[1] === 'control');
			styles ||= native.styleIndices.length > 0;
			const normalizedChildren = normalize(node.children ?? [], selfNs);
			const opaqueChildren =
				normalizedChildren.length > 0 &&
				normalizedChildren.every((child) => child._octaneBindingOpaque);
			const nativeNode = [
				parent,
				'element',
				tag,
				selfNs,
				tag === 'textarea' || opaqueChildren ? null : 0,
			];
			if (opaqueChildren)
				constructionError ??=
					'This view contains externally owned children that cannot be constructed by a binding program.';
			appendNode(nativeNode);
			for (let i = 0; i < native.bindings.length; i++) {
				const binding = native.bindings[i];
				bindings.push(
					binding[1] === 'classGroup'
						? [index, 'classGroup', `data-octane-class-${id}-${index}`, binding[3]]
						: [index, ...binding.slice(1)],
				);
				values.push(native.values[i]);
			}
			const attributes = createTemplateIr();
			for (const attr of node.attributes ?? []) {
				if (attr._octaneKnownAttributeSpread) continue;
				if (rawName(attr) === 'ref' || /^on[A-Z]/.test(rawName(attr) ?? '')) continue;
				if (attr.type === 'SpreadAttribute' || attr.type === 'JSXSpreadAttribute') {
					constructionError ??=
						'This view contains an external attribute spread without a native construction adapter.';
					continue;
				}
				const raw = rawName(attr);
				const name = raw === 'className' ? 'class' : (ATTRIBUTE_ALIASES.get(raw) ?? raw);
				// The staged capability owns these values after native construction.
				if (
					native.bindings.some(
						(binding) =>
							(binding[1] === 'control' && binding[2] === name) ||
							(binding[1] === 'styleObject' && name === 'style'),
					)
				)
					continue;
				const expression = attrValue(attr);
				const bare = unwrap(expression);
				const external = native.unbound.has(bare);
				const value = external ? native.unbound.get(bare) : expression;
				const literal = unwrap(value);
				const property =
					(tag !== 'button' || raw !== 'value') &&
					['value', 'checked', 'defaultValue', 'defaultChecked', 'selected'].includes(raw);
				const classGroup = native.classAttributes.get(attr)?._octaneBindingClassGroups;
				if (classGroup) {
					initialize(index, 'classGroupInitial', classGroup.receipt, b.array(classGroup.baseline));
				} else if (raw === 'dangerouslySetInnerHTML') {
					if ((node.children ?? []).some(significant))
						fail(attr, 'an opaque HTML host cannot also declare binding children');
					nativeNode[4] = null;
					constructionError ??=
						'This view contains externally owned HTML that cannot be constructed by a binding program.';
				} else if (property) {
					initialize(index, raw, raw, value);
				} else if (name === 'style' && literal?.type === 'ObjectExpression') {
					for (const field of literal.properties) {
						if (
							field.type !== 'Property' ||
							field.computed ||
							field.kind !== 'init' ||
							field.method
						) {
							constructionError ??=
								'This view contains an external style object without fixed properties.';
							continue;
						}
						const key = field.key.name ?? field.key.value;
						if (external || unwrap(field.value)?.type === 'Literal')
							initialize(
								index,
								'styleProperty',
								hyphenateStyleName(key),
								field.value,
								key.startsWith('--') || isUnitlessStyleProp(key),
							);
					}
				} else if (name === 'style') {
					if (external || literal?.type === 'Literal')
						initialize(index, 'styleAttribute', 'style', value);
				} else if (literal?.type === 'Literal') {
					appendTemplatePart(
						attributes,
						helpers.bakeStaticAttr(name, literal.value, tag, selfNs === 1 ? 'svg' : 'html'),
						'attribute',
					);
				} else if (
					external ||
					(name === 'class' && !native.bindings.some((binding) => binding[1] === 'class'))
				) {
					const kind =
						name === 'class'
							? 'class'
							: shouldSanitizeURLAttribute(tag, name)
								? 'url'
								: name.startsWith('aria-') ||
									  name.startsWith('data-') ||
									  isEnumeratedBooleanAttr(name.toLowerCase())
									? 'aria'
									: BOOLEAN_ATTR_PROPS.has(name.toLowerCase())
										? 'boolean'
										: 'attr';
					initialize(index, kind, name, mapCow(value, native.unbound));
				}
			}
			const children = createTemplateIr();
			if (tag === 'textarea') {
				const hasValue = (node.attributes ?? []).some((attr) =>
					['value', 'defaultValue'].includes(rawName(attr)),
				);
				if (!hasValue) {
					const text = normalizedChildren;
					if (
						text.every(
							(child) => child.type === 'Text' && unwrap(child.expression)?.type === 'Literal',
						)
					) {
						for (const child of text)
							appendTemplatePart(
								children,
								helpers.escapeHtml(String(unwrap(child.expression).value)),
								'text',
							);
					} else if (text.length > 0)
						constructionError ??= 'This textarea has external children without an initial value.';
				}
			} else if (nativeNode[4] !== null) {
				for (const child of normalizedChildren)
					appendTemplateIr(children, emit(child, index, selfNs, [...parents, tag]));
			}
			return templateElement(
				tag,
				selfNs === 1 ? 'svg' : 'html',
				VOID_ELEMENTS.has(tag),
				attributes,
				children,
				null,
				null,
			);
		};
		const template = createTemplateIr();
		for (const node of normalize(rawNodes, namespace))
			appendTemplateIr(template, emit(node, -1, namespace, ancestors));
		if (constructionError !== null) structural = false;
		if (context.annotationsOnly) return { fragment: null, structural };
		const properties = {
			html: b.literal(serializeTemplateIr(template).html),
			ns: b.literal(namespace),
			nodes: data(nodes),
			bindings: data(bindings),
			project: project(names, b.array(values), fn, projections),
			regions: b.array(regions),
			...(restSites.length ? { restSites: b.array(restSites) } : {}),
			...(signalIndices.length ? { signalIndices: data(signalIndices) } : {}),
			...(styleIndices.length ? { styleIndices: data(styleIndices) } : {}),
			...(projectionGroups.length ? { projectionGroups: data(projectionGroups) } : {}),
		};
		if (initializers.length > 0) {
			properties.initializers = data(initializers);
			properties.initialize = project(names, b.array(initialValues));
		}
		if (bindings.some((binding) => binding[1] === 'classGroup')) {
			if (classFactory === null) {
				classFactory = allocateProgramName('_bindingClassGroup');
				dependencies.push(
					origin(
						b.imports([['createBindingClassGroup', classFactory]], 'octane/dom-binding-classes'),
						fn,
					),
				);
			}
			properties.createClassGroup = b.id(classFactory);
		}
		if (constructionError !== null) {
			properties.constructible = b.literal(false);
			properties.constructionError = b.literal(constructionError);
		}
		if (adapters.length > 0) {
			if (activationHelper === null) {
				activationHelper = allocateProgramName('_bindingAdapters');
				dependencies.push(
					origin(
						b.imports(
							[['__activateBindingAdapters', activationHelper]],
							'octane/dom-binding-program',
						),
						fn,
					),
				);
			}
			const nodesName = allocateProgramName('_bindingNodes');
			const contextName = allocateProgramName('_bindingContext');
			properties.activate = origin(
				b.arrow(
					[b.id(nodesName), b.id(contextName)],
					b.call(b.id(activationHelper), b.id(nodesName), b.id(contextName), b.array(adapters)),
				),
				fn,
			);
		}
		return { fragment: object(properties), structural };
	};
	const { fragment: root, structural } = compileFragment([annotated], parameterNames);
	for (const [call, value] of unbound) replacements.set(call, value);
	const finalRender = mapCow(
		annotated,
		new Map([...unbound, ...classAttributes, ...restAttributes]),
	);
	replacements.set(render, finalRender);
	if (context.annotationsOnly) return { id, replacements, structural: structural && !controls };
	return {
		fn,
		render: finalRender,
		id,
		root,
		// Native destructuring runs once at component preparation, shared by every
		// projection and committed adapter. Replaying it in each projector would
		// repeat getters and create different rest objects within one preparation.
		prepareProps:
			fn.params[0]?.type === 'ObjectPattern'
				? origin(b.arrow(fn.params, b.array(parameterNames.map((name) => b.id(name)))), fn)
				: null,
		expressions,
		dependencies,
		hoists,
		replacements,
		unbound,
		signals,
		controls,
		styles,
		projectionsEnabled,
		structural: structural && !controls,
		childPrograms,
	};
}
