import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const repo = path.resolve(import.meta.dirname, '../../..');
const require = createRequire(path.join(repo, 'packages/octane/package.json'));
const { parseModule } = await import(pathToFileURL(require.resolve('@tsrx/core')).href);

// This proof is deliberately narrower than Octane's binding compiler. The host
// must supply immutable, own-data string snapshots and a one-owner subscription.
export function analyze(source, file) {
	let program;
	try {
		program = parseModule(source, file);
	} catch {
		return null;
	}
	if (program.body.length !== 1 || program.body[0].type !== 'ExportNamedDeclaration') return null;
	const declaration = program.body[0];
	const fn = declaration.declaration;
	if (
		declaration.source ||
		declaration.specifiers.length ||
		fn?.type !== 'FunctionDeclaration' ||
		fn.async ||
		fn.generator ||
		fn.typeParameters ||
		fn.returnType ||
		!fn.id?.name ||
		fn.params.length !== 1 ||
		fn.params[0].type !== 'Identifier' ||
		fn.body?.type !== 'JSXCodeBlock' ||
		fn.body.body.length !== 0
	)
		return null;
	const props = fn.params[0];
	const type = props.typeAnnotation?.typeAnnotation;
	if (type?.type !== 'TSTypeLiteral' || !type.members.length) return null;
	const fields = new Set();
	for (const field of type.members) {
		if (
			field.type !== 'TSPropertySignature' ||
			field.computed ||
			field.optional ||
			field.key?.type !== 'Identifier' ||
			field.typeAnnotation?.typeAnnotation?.type !== 'TSStringKeyword' ||
			fields.has(field.key.name) ||
			field.key.name === '__proto__'
		)
			return null;
		fields.add(field.key.name);
	}
	const seen = new Set();
	const staticAttributes = [];
	const names = new Set(['section', 'h1', 'p', 'span']);
	function element(node, parent) {
		if (node?.type !== 'JSXElement' || node.openingElement?.name?.type !== 'JSXIdentifier')
			return false;
		const tag = node.openingElement.name.name;
		if (
			!names.has(tag) ||
			(parent === null ? tag !== 'section' : parent !== 'section' && tag !== 'span')
		)
			return false;
		const attributes = [];
		for (const attribute of node.openingElement.attributes) {
			const name = attribute.name?.name;
			if (
				attribute.type !== 'JSXAttribute' ||
				attribute.name?.type !== 'JSXIdentifier' ||
				!(
					name === 'id' ||
					name === 'class' ||
					name === 'title' ||
					/^aria-[a-z-]+$/.test(name) ||
					(/^data-[a-z-]+$/.test(name) && !name.startsWith('data-octane-'))
				) ||
				attribute.value?.type !== 'Literal' ||
				typeof attribute.value.value !== 'string'
			)
				return false;
			if (attributes.some(([other]) => other === name)) return false;
			attributes.push([name, attribute.value.value]);
		}
		staticAttributes.push(attributes);
		if (
			!node.children.length &&
			node.closingElement &&
			source.slice(node.openingElement.end, node.closingElement.start) !== ''
		)
			return false;
		const nestedElements = node.children.some((child) => child.type === 'JSXElement');
		if (
			node.children.some(
				(child) =>
					child.type === 'JSXText' &&
					(child.value.trim() || !child.value.includes('\n') || !nestedElements),
			)
		)
			return false;
		const children = node.children.filter((child) => child.type !== 'JSXText');
		const expressions = children.filter((child) => child.type === 'JSXExpressionContainer');
		if (expressions.length && (children.length !== 1 || expressions.length !== 1)) return false;
		for (const child of children) {
			if (child.type === 'JSXText') return false;
			if (child.type === 'JSXElement') {
				if (!element(child, tag)) return false;
				continue;
			}
			const cast = child.expression;
			const value = cast?.expression;
			if (
				child.type !== 'JSXExpressionContainer' ||
				cast?.type !== 'TSAsExpression' ||
				cast.typeAnnotation?.type !== 'TSStringKeyword' ||
				value?.type !== 'MemberExpression' ||
				value.computed ||
				value.optional ||
				value.object?.type !== 'Identifier' ||
				value.object.name !== props.name ||
				value.property?.type !== 'Identifier' ||
				!fields.has(value.property.name)
			)
				return false;
			seen.add(value.property.name);
		}
		return true;
	}
	if (!element(fn.body.render, null) || seen.size !== fields.size) return null;
	return { name: fn.id.name, fields: [...fields], staticAttributes, insertAt: fn.body.start + 2 };
}

export function transform(source, file) {
	const proof = analyze(source, file);
	return (
		proof && {
			...proof,
			code: `${source.slice(0, proof.insertAt)}\n'use dom bindings';\n${source.slice(proof.insertAt)}`,
		}
	);
}
