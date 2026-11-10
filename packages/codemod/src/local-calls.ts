import ts from 'typescript';
import { isWrapper, skipWrappers } from './expression-wrappers.js';

type Helper = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction;
export type Invocation = { call: ts.CallExpression; helper: Helper; outer?: Invocation };
// null joins every visible caller when the number of distinct nested invocations grows too large.
export type CallContext = Invocation | null | undefined;

function isHelper(node: ts.Node): node is Helper {
	return (
		ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)
	);
}

export function localCalls(
	file: ts.SourceFile,
	checker: ts.TypeChecker,
	reassigned: (symbol: ts.Symbol) => boolean,
) {
	const targets = new Map<ts.CallExpression, Helper>();
	const callers = new Map<Helper, ts.CallExpression[]>();
	const results = new Map<Helper, ts.Expression[]>();
	const frames = new Map<ts.CallExpression, Map<Invocation | undefined, Invocation>>();
	const owners = new Map<ts.Node, Helper | undefined>();

	function owner(node: ts.Node) {
		if (!owners.has(node)) {
			const fn = ts.findAncestor(node.parent, ts.isFunctionLike);
			owners.set(node, fn && isHelper(fn) ? fn : undefined);
		}
		return owners.get(node);
	}

	function scan(call: ts.CallExpression) {
		let expr: ts.Node = call.expression;
		const aliases = new Set<ts.Symbol>();
		while (ts.isIdentifier(expr) || isWrapper(expr)) {
			if (isWrapper(expr)) {
				expr = expr.expression;
				continue;
			}
			const symbol = checker.getSymbolAtLocation(expr);
			const d: ts.Declaration | undefined = symbol?.valueDeclaration;
			if (!symbol || !d || aliases.has(symbol) || reassigned(symbol) || d.getSourceFile() !== file)
				return;
			aliases.add(symbol);
			if (
				ts.isVariableDeclaration(d) &&
				d.initializer &&
				ts.isVariableDeclarationList(d.parent) &&
				d.parent.flags & ts.NodeFlags.Const
			)
				expr = d.initializer;
			else {
				expr = d;
				break;
			}
		}
		if (!isHelper(expr) || !expr.body) return;
		targets.set(call, expr);
		const uses = callers.get(expr);
		if (uses) uses.push(call);
		else callers.set(expr, [call]);
	}

	function returns(fn: Helper) {
		let found = results.get(fn);
		if (!found) {
			found = [];
			results.set(fn, found);
			if (
				fn.body &&
				!fn.asteriskToken &&
				!fn.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)
			) {
				if (!ts.isBlock(fn.body)) found.push(fn.body);
				else {
					const collect = (node: ts.Node) => {
						if (ts.isFunctionLike(node) || ts.isClassLike(node)) return;
						if (ts.isReturnStatement(node)) {
							if (node.expression) found!.push(node.expression);
						} else ts.forEachChild(node, collect);
					};
					ts.forEachChild(fn.body, collect);
				}
			}
		}
		return found;
	}

	function frame(call: ts.CallExpression, outer?: Invocation): Invocation {
		let byOuter = frames.get(call);
		if (!byOuter) {
			byOuter = new Map();
			frames.set(call, byOuter);
		}
		let invocation = byOuter.get(outer);
		if (!invocation) {
			invocation = { call, helper: targets.get(call)!, outer };
			byOuter.set(outer, invocation);
		}
		return invocation;
	}

	function enclosing(context: CallContext, fn: ts.Node | undefined): Invocation | undefined {
		for (let f = context; f; f = f.outer) if (f.helper === fn) return f;
	}

	const identityParameters = new Map<Helper, number>();
	function forwardedArgument(call: ts.CallExpression) {
		const fn = targets.get(call);
		if (!fn?.body) return;
		let index = identityParameters.get(fn);
		if (index === undefined) {
			const [returned] = returns(fn);
			const result = returned && skipWrappers(returned);
			const single =
				!ts.isBlock(fn.body) ||
				(fn.body.statements.length === 1 && ts.isReturnStatement(fn.body.statements[0]));
			const plain = fn.parameters.every(
				(p) =>
					ts.isIdentifier(p.name) && !p.initializer && !p.dotDotDotToken && p.name.text !== 'this',
			);
			const param =
				plain && single && result && ts.isIdentifier(result)
					? checker.getSymbolAtLocation(result)?.valueDeclaration
					: undefined;
			index = param && ts.isParameter(param) ? fn.parameters.indexOf(param) : -1;
			identityParameters.set(fn, index);
		}
		return !call.arguments.some(ts.isSpreadElement) ? call.arguments[index] : undefined;
	}

	// A write inside a wrapper is also a template for invocations whose outer caller
	// was still unknown when its local receiver was indexed.
	function atRead(
		source: CallContext,
		written: CallContext,
		read: CallContext,
	): CallContext | false {
		if (!written || !read) return source === undefined ? read : source;
		let left: Invocation | undefined = written,
			right: Invocation | undefined = read;
		while (left && right) {
			if (left.call !== right.call) return false;
			left = left.outer;
			right = right.outer;
		}
		if (!right || !source) return source;
		function complete(context: Invocation): Invocation {
			return context === written
				? read!
				: context.outer
					? frame(context.call, complete(context.outer))
					: context;
		}
		return complete(source);
	}
	function sites(fn: ts.Node) {
		return isHelper(fn) ? (callers.get(fn) ?? []) : [];
	}
	return { scan, targets, sites, returns, forwardedArgument, owner, frame, enclosing, atRead };
}
