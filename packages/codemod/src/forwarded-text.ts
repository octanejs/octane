import ts from 'typescript';
import { localUses } from './local-uses.js';

/** The DOM attributes whose renderer stringifies the supplied value. */
function hostText(tag: ts.JsxTagNameExpression, prop: string) {
	return (
		ts.isIdentifier(tag) &&
		/^[a-z][a-z0-9]*$/.test(tag.text) &&
		(prop === 'title' ||
			prop.startsWith('aria-') ||
			prop.startsWith('data-') ||
			(prop === 'placeholder' && ['input', 'textarea'].includes(tag.text)) ||
			(prop === 'alt' && ['img', 'input', 'area'].includes(tag.text)) ||
			(prop === 'label' && ['option', 'optgroup', 'track'].includes(tag.text)))
	);
}

function hostAttribute(attr: ts.JsxAttributeLike, prop: string) {
	return (
		hostText(attr.parent.parent.tagName, prop) &&
		attr.parent.properties.every(
			(a) =>
				a === attr ||
				(ts.isJsxAttribute(a) && a.name.getText() !== prop && a.name.getText() !== 'is'),
		)
	);
}

function directAttribute(value: ts.Node) {
	const expr = value.parent;
	if (!ts.isJsxExpression(expr) || !ts.isJsxAttribute(expr.parent)) return false;
	const attr = expr.parent;
	return ts.isIdentifier(attr.name) && hostAttribute(attr, attr.name.text);
}

/** Find the single binding that receives this property, or the rest bag containing it. */
function incoming(param: ts.ParameterDeclaration, prop: string) {
	if (param.dotDotDotToken || param.initializer) return null;
	if (ts.isIdentifier(param.name)) return { name: param.name, bag: true };
	if (!ts.isObjectBindingPattern(param.name)) return null;
	let direct: ts.BindingElement | undefined, rest: ts.BindingElement | undefined;
	for (const field of param.name.elements) {
		const key = field.propertyName ?? field.name;
		if (!ts.isIdentifier(key) && !ts.isStringLiteral(key)) return null;
		if (field.dotDotDotToken) rest = field;
		else if (key.text === prop) {
			if (direct) return null;
			direct = field;
		}
	}
	const field = direct ?? rest;
	return field && !field.initializer && ts.isIdentifier(field.name)
		? { name: field.name, bag: !!field.dotDotDotToken }
		: null;
}

/** Prove that every use of the incoming prop forwards it to an intrinsic text attribute. */
export function forwardedTextProps(
	file: ts.SourceFile,
	checker: ts.TypeChecker,
	uses = localUses(file, checker),
) {
	// Direct eval may read any local or reassign a component declaration by spelling alone.
	function mentions(node: ts.Node, name: string): boolean {
		return (
			(ts.isIdentifier(node) && node.text === name) ||
			ts.forEachChild(node, (child) => mentions(child, name) || undefined) === true
		);
	}
	if (mentions(file, 'eval')) return () => false;
	const proven = new Map<ts.Symbol, Map<string, boolean>>();
	function check(symbol: ts.Symbol, prop: string): boolean {
		const decl = symbol.valueDeclaration;
		if (!decl || decl.getSourceFile() !== file || symbol.declarations?.length !== 1) return false;
		const fn = ts.isFunctionDeclaration(decl)
			? decl
			: ts.isVariableDeclaration(decl) &&
				  ts.getCombinedNodeFlags(decl) & ts.NodeFlags.Const &&
				  decl.initializer &&
				  (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))
				? decl.initializer
				: null;
		if (!fn?.body || fn.parameters.length !== 1) return false;
		// A function declaration can be reassigned. Be conservative about uses of its binding.
		if (
			ts.isFunctionDeclaration(decl) &&
			decl.name &&
			!uses(decl.name).every((ref) => {
				const p = ref.parent;
				return (
					(ts.isJsxOpeningElement(p) ||
						ts.isJsxClosingElement(p) ||
						ts.isJsxSelfClosingElement(p)) &&
					p.tagName === ref
				);
			})
		)
			return false;
		const binding = incoming(fn.parameters[0], prop);
		if (!binding) return false;
		// The arguments object is another way to read the original props.
		if (mentions(fn, 'arguments')) return false;
		const refs = uses(binding.name);
		return (
			refs.length > 0 &&
			refs.every((ref) => {
				if (!binding.bag) return directAttribute(ref);
				const p = ref.parent;
				if (ts.isPropertyAccessExpression(p) && p.expression === ref && p.name.text === prop)
					return directAttribute(p);
				return ts.isJsxSpreadAttribute(p) && p.expression === ref && hostAttribute(p, prop);
			})
		);
	}
	return (symbol: ts.Symbol | undefined, prop: string) => {
		if (!symbol || ['ref', 'key', 'children', 'is', '__proto__'].includes(prop)) return false;
		let props = proven.get(symbol);
		if (!props) proven.set(symbol, (props = new Map()));
		if (!props.has(prop)) props.set(prop, check(symbol, prop));
		return props.get(prop)!;
	};
}
