/**
 * Enforce direct Node property/method access at the renderer's preparation seam
 * without duplicating DOMStage's modeled keys. TypeScript's DOM declarations
 * classify native members; casts and traceable local aliases retain ownership.
 * Identity/geometry reads and exact imperative/native lifecycle operations are
 * reviewed exemptions below. This is not whole-program escape analysis: opaque
 * callbacks, untyped external aliases, reflective operations, and user-defined
 * expandos still need the public/native behavioral tests and code review.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const runtimeFile = path.join(ROOT, 'packages/octane/src/runtime.ts');

// Identity and committed geometry have no projected counterpart. These are
// read-only exemptions: assigning even one of these members still needs review.
const NATIVE_READS = new Set(
	`nodeType nodeName localName namespaceURI prefix tagName ownerDocument
 content host documentElement body head defaultView implementation activeElement shadowRoot contentDocument
 baseURI documentURI readyState visibilityState scrollingElement fonts styleSheets adoptedStyleSheets
 clientHeight clientWidth clientTop clientLeft offsetHeight offsetWidth offsetTop offsetLeft offsetParent
 scrollHeight scrollWidth getBoundingClientRect getClientRects getSelection isSameNode
 createTreeWalker createNodeIterator createRange`.split(/\s+/),
);

// Exact native-only operations in module-level declarations, grouped by the
// reason they bypass preparation. Nested declarations cannot borrow an exemption
// by reusing a reviewed name. New operations still fail unless listed here.
const NATIVE_OPERATIONS = new Map(
	Object.entries({
		// These module-level getters route preparation first, then use committed
		// native access if DOM initialization has not supplied the cached getter.
		getFirstChild: ['read:firstChild'],
		getNextSibling: ['read:nextSibling'],
		// Transition handles inspect the current animation tree and committed resources.
		vtScopeName: ['read:style', 'read:activeViewTransition'],
		'ViewTransitionPseudoElement.animate': ['call:animate'],
		'ViewTransitionPseudoElement.getAnimations': ['call:getAnimations'],
		vtStartNative: ['read:startViewTransition'],
		vtNativeAvailable: ['read:startViewTransition'],
		vtCancelOldCapture: ['read:animate', 'call:animate'],
		vtFinalizeGroup: ['read:animate', 'call:animate'],
		vtWaitForResources: ['read:complete', 'read:loading', 'read:onload', 'read:sheet'],
		vtOwnerAffected: ['call:contains'],
		vtFlush: [
			'read:isConnected',
			'call:getAttribute',
			'read:startViewTransition',
			'call:getAnimations',
		],
		captureFocusSelection: ['read:contentEditable'],
		// Public imperative handles and notifications act on the currently visible DOM.
		notifyHydrateBoundary: ['call:dispatchEvent'],
		// Parent-free island activation replays captured native intent against the
		// surviving, already-adopted target, never against projected replacement DOM.
		createIndependentHydrateActivator: ['call:contains', 'call:dispatchEvent'],
		// Explicit early-binding leases refer to committed native nodes: validate
		// container ownership before hydration, match the existing SSR marker, and
		// retire detached anchors only after a root replacement has been accepted.
		hydrateRoot: ['call:contains'],
		beginPresentationHydration: ['read:nextSibling'],
		// These proofs and rollback guards compare the early owner's live range,
		// not the renderer's projected tree. A stale candidate cannot authorize
		// restoring or publishing over newer early DOM.
		journalRootRange: ['read:parentNode', 'read:nextSibling'],
		// A single-host lease also proves membership in its live owner's container.
		currentPresentation: ['read:parentNode', 'call:contains'],
		presentationRange: ['read:data', 'read:parentNode'],
		// Allocates detached text during preparation; insertion and nodeValue
		// writes run only through accepted preparePresentationOperation callbacks.
		bindingText: [
			'call:createTextNode',
			'call:insertBefore',
			'read:parentNode',
			'read:nodeValue',
			'write:nodeValue',
		],
		// The native `is` attribute describes construction identity. A projected
		// attribute cannot make an existing custom element safe to adopt.
		prepareSignalHostPropSources: ['call:hasAttribute'],
		// Container membership proves the early owner's committed native node.
		// The blur listener and value resample run only in accepted publication,
		// around retirement of the offered control owner, never during preparation.
		preparePresentationSignalValue: ['call:contains', 'call:addEventListener', 'read:value'],
		retireDetachedBindingLeases: ['call:contains'],
		'FragmentInstance.dispatchEvent': ['call:dispatchEvent'],
		'FragmentInstance.scrollIntoView': ['call:scrollIntoView'],
		focusFragmentElement: ['read:focus'],
		// Root delegation and native submit/default restoration are publication work.
		delegateEvents: ['call:addEventListener'],
		delegateCaptureEvents: ['call:addEventListener'],
		registerDelegationTarget: ['read:onclick', 'write:onclick', 'call:addEventListener'],
		unregisterDelegationTarget: ['call:removeEventListener'],
		publishManualFormPending: ['read:method'],
		resetFormNow: ['call:reset'],
		handleFormSubmit: ['call:reset'],
		reassertControlledIn: ['read:elements'],
	}),
);

function unwrap(node) {
	while (
		ts.isAsExpression(node) ||
		ts.isTypeAssertionExpression(node) ||
		ts.isParenthesizedExpression(node) ||
		ts.isNonNullExpression(node)
	)
		node = node.expression;
	return node;
}

function owner(node) {
	for (let current = node.parent; current !== undefined; current = current.parent) {
		if (ts.isFunctionDeclaration(current) && current.name)
			return ts.isSourceFile(current.parent) ? current.name.text : `<nested>.${current.name.text}`;
		if (ts.isMethodDeclaration(current) && current.name) {
			const parent = current.parent;
			const name = `${parent.name?.text ?? '<class>'}.${current.name.getText()}`;
			return ts.isClassDeclaration(parent) && ts.isSourceFile(parent.parent)
				? name
				: `<nested>.${name}`;
		}
	}
	return '<top-level>';
}

export function inspectStagedDOM(text, file = runtimeFile) {
	const host = ts.createCompilerHost({});
	const readFile = host.readFile.bind(host);
	if (text !== undefined)
		host.readFile = (name) => (path.resolve(name) === path.resolve(file) ? text : readFile(name));
	const program = ts.createProgram(
		[file],
		{
			target: ts.ScriptTarget.ESNext,
			module: ts.ModuleKind.ESNext,
			moduleResolution: ts.ModuleResolutionKind.Bundler,
			strict: true,
			skipLibCheck: true,
		},
		host,
	);
	const checker = program.getTypeChecker();
	const source = program.getSourceFile(file);
	if (!source) throw new Error(`Cannot read ${file}`);
	const moduleBindings = new Map();
	for (const statement of source.statements) {
		if (ts.isVariableStatement(statement))
			for (const declaration of statement.declarationList.declarations)
				if (ts.isIdentifier(declaration.name))
					moduleBindings.set(declaration.name.text, checker.getSymbolAtLocation(declaration.name));
	}
	const moduleBinding = (node, name) =>
		ts.isIdentifier(node) &&
		node.text === name &&
		moduleBindings.has(name) &&
		checker.getSymbolAtLocation(node) === moduleBindings.get(name);
	const failures = [];
	const fromDOM = (symbol) =>
		symbol?.declarations?.some((entry) =>
			/\/lib\.dom(?:\.iterable)?\.d\.ts$/.test(entry.getSourceFile().fileName),
		);
	const initializer = (node) =>
		ts.isIdentifier(node)
			? checker.getSymbolAtLocation(node)?.valueDeclaration?.initializer
			: undefined;
	function literalKey(expression) {
		const node = unwrap(expression);
		if (ts.isStringLiteralLike(node)) return node.text;
		if (!ts.isIdentifier(node)) return null;
		const declaration = checker.getSymbolAtLocation(node)?.valueDeclaration;
		if (
			!declaration ||
			!ts.isVariableDeclaration(declaration) ||
			!ts.isVariableDeclarationList(declaration.parent) ||
			!(declaration.parent.flags & ts.NodeFlags.Const) ||
			!declaration.initializer
		)
			return null;
		const value = unwrap(declaration.initializer);
		return ts.isStringLiteralLike(value) ? value.text : null;
	}
	function nodeReceiver(expression, depth = 0) {
		if (depth > 12) return false;
		const type = checker.getNonNullableType(checker.getTypeAtLocation(expression));
		if (fromDOM(type.getProperty('nodeType'))) return true;
		const unwrapped = unwrap(expression);
		if (unwrapped !== expression) return nodeReceiver(unwrapped, depth + 1);
		const initial = initializer(expression);
		return initial !== undefined && nodeReceiver(initial, depth + 1);
	}
	function nativeProperty(expression, key, depth = 0) {
		if (depth > 12) return false;
		const type = checker.getNonNullableType(checker.getTypeAtLocation(expression));
		if (fromDOM(type.getProperty(key))) return true;
		const raw = unwrap(expression);
		if (raw !== expression) return nativeProperty(raw, key, depth + 1);
		const initial = initializer(raw);
		return initial !== undefined && nativeProperty(initial, key, depth + 1);
	}
	function preparedReceiver(expression, depth = 0) {
		if (depth > 12) return false;
		const node = unwrap(expression);
		if (
			ts.isBinaryExpression(node) &&
			node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
		) {
			const native = unwrap(node.right);
			const prepared = unwrap(node.left);
			const view = ts.isCallExpression(prepared) ? unwrap(prepared.expression) : undefined;
			// The cold preparation branch is inlined only around local identifiers.
			// Matching bindings proves that the optional stage and both selected receivers
			// refer to the renderer's actual stage and the same native node. Restricting
			// the receiver also preserves evaluation order for getters and function calls.
			return (
				ts.isIdentifier(native) &&
				ts.isCallExpression(prepared) &&
				prepared.questionDotToken === undefined &&
				ts.isPropertyAccessExpression(view) &&
				view.questionDotToken !== undefined &&
				view.name.text === 'view' &&
				moduleBinding(unwrap(view.expression), 'STAGED_DOM') &&
				prepared.arguments.length === 1 &&
				ts.isIdentifier(unwrap(prepared.arguments[0])) &&
				checker.getSymbolAtLocation(native) !== undefined &&
				checker.getSymbolAtLocation(native) ===
					checker.getSymbolAtLocation(unwrap(prepared.arguments[0]))
			);
		}
		if (ts.isCallExpression(node)) {
			const callee = node.expression;
			return (
				(ts.isIdentifier(callee) && callee.text === 'domNode') ||
				(ts.isPropertyAccessExpression(callee) &&
					callee.name.text === 'view' &&
					callee.expression.getText(source) === 'STAGED_DOM')
			);
		}
		const initial = initializer(node);
		return initial !== undefined && preparedReceiver(initial, depth + 1);
	}
	function operation(access) {
		let node = access;
		while (ts.isParenthesizedExpression(node.parent)) node = node.parent;
		const parent = node.parent;
		if (ts.isCallExpression(parent) && parent.expression === node) return 'call';
		if (
			ts.isDeleteExpression(parent) ||
			ts.isPrefixUnaryExpression(parent) ||
			ts.isPostfixUnaryExpression(parent)
		)
			return 'write';
		if (
			ts.isBinaryExpression(parent) &&
			parent.left === node &&
			parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
			parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment
		)
			return 'write';
		return 'read';
	}
	function visit(node) {
		if (
			(ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
			nodeReceiver(node.expression) &&
			!preparedReceiver(node.expression)
		) {
			const argumentType = ts.isElementAccessExpression(node)
				? checker.getTypeAtLocation(node.argumentExpression)
				: undefined;
			const key = ts.isPropertyAccessExpression(node)
				? node.name.text
				: literalKey(node.argumentExpression);
			// Renderer-owned symbols/expandos aren't native operations. Their lifecycle
			// publication is checked in the effect/event suites, not inferred from names.
			const symbolKey = argumentType && (argumentType.flags & ts.TypeFlags.ESSymbolLike) !== 0;
			const dynamic = key === null && !symbolKey;
			// Resolve through any casts/aliases so they cannot bypass native checks.
			if (dynamic || (key !== null && nativeProperty(node.expression, key))) {
				const kind = operation(node);
				const scope = owner(node);
				if (
					!(kind === 'read' && NATIVE_READS.has(key)) &&
					!(kind === 'call' && NATIVE_READS.has(key)) &&
					!NATIVE_OPERATIONS.get(scope)?.includes(`${kind}:${key}`)
				) {
					const position = source.getLineAndCharacterOfPosition(node.getStart(source));
					failures.push({
						line: position.line + 1,
						column: position.character + 1,
						owner: scope,
						operation: `${kind}:${key ?? '[dynamic]'}`,
						expression: node.getText(source),
					});
				}
			}
		}
		ts.forEachChild(node, visit);
	}
	visit(source);
	return failures;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const failures = inspectStagedDOM();
	for (const finding of failures)
		console.error(
			`${path.relative(ROOT, runtimeFile)}:${finding.line}:${finding.column} ${finding.owner}: unclassified ${finding.operation} (${finding.expression})`,
		);
	if (failures.length !== 0) process.exitCode = 1;
	else console.log('Staged DOM operation boundaries are classified.');
}
