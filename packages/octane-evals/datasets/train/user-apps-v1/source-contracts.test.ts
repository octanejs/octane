import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseModule } from '@tsrx/core';
import { describe, expect, it } from 'vitest';

interface AstNode {
	type: string;
	start?: number;
	end?: number;
	[key: string]: unknown;
}

const corpusRoot = dirname(fileURLToPath(import.meta.url));
const tasksRoot = join(corpusRoot, 'tasks');
const skippedKeys = new Set([
	'loc',
	'metadata',
	'comments',
	'leadingComments',
	'trailingComments',
	'innerComments',
	'parent',
]);

function childNodes(root: unknown): AstNode[] {
	const found: AstNode[] = [];
	const seen = new WeakSet<object>();
	function visit(value: unknown): void {
		if (value === null || typeof value !== 'object' || seen.has(value)) return;
		seen.add(value);
		if ('type' in value && typeof value.type === 'string') found.push(value as AstNode);
		for (const [key, child] of Object.entries(value)) {
			if (skippedKeys.has(key)) continue;
			if (Array.isArray(child)) child.forEach(visit);
			else visit(child);
		}
	}
	visit(root);
	return found;
}

function nodes(root: unknown, type: string): AstNode[] {
	return childNodes(root).filter((node) => node.type === type);
}

function identifierName(node: unknown): string | undefined {
	if (node === null || typeof node !== 'object') return undefined;
	if (
		'type' in node &&
		(node.type === 'Identifier' || node.type === 'JSXIdentifier') &&
		'name' in node
	)
		return String(node.name);
	return undefined;
}

function memberName(node: unknown): string | undefined {
	if (node === null || typeof node !== 'object' || !('type' in node)) return undefined;
	if (node.type === 'Identifier') return identifierName(node);
	if (node.type === 'MemberExpression' && 'property' in node) return identifierName(node.property);
	return undefined;
}

function calls(root: unknown, name: string): AstNode[] {
	return nodes(root, 'CallExpression').filter((node) => memberName(node.callee) === name);
}

function callArguments(node: AstNode): AstNode[] {
	return Array.isArray(node.arguments) ? (node.arguments as AstNode[]) : [];
}

function importsFrom(ast: AstNode, moduleName: string): Set<string> {
	const names = new Set<string>();
	for (const declaration of nodes(ast, 'ImportDeclaration')) {
		const source = declaration.source as { value?: unknown } | undefined;
		if (source?.value !== moduleName || !Array.isArray(declaration.specifiers)) continue;
		for (const specifier of declaration.specifiers as AstNode[]) {
			if (specifier.type === 'ImportSpecifier') {
				const imported = identifierName(specifier.imported);
				if (imported) names.add(imported);
			} else if (specifier.type === 'ImportDefaultSpecifier') names.add('default');
			else if (specifier.type === 'ImportNamespaceSpecifier') names.add('*');
		}
	}
	return names;
}

function jsxName(node: AstNode): string | undefined {
	const opening = node.openingElement as AstNode | undefined;
	const name = opening?.name as AstNode | undefined;
	if (!name) return undefined;
	if (name.type === 'JSXIdentifier') return String(name.name);
	if (name.type === 'JSXMemberExpression') {
		const object = name.object as AstNode;
		const property = name.property as AstNode;
		return `${String(object.name)}.${String(property.name)}`;
	}
	return undefined;
}

function jsxElements(root: unknown, name?: string): AstNode[] {
	const elements = nodes(root, 'JSXElement');
	return name === undefined ? elements : elements.filter((node) => jsxName(node) === name);
}

function jsxAttributes(root: unknown, name: string): AstNode[] {
	return nodes(root, 'JSXAttribute').filter((node) => identifierName(node.name) === name);
}

function attributeExpression(attribute: AstNode | undefined): AstNode | undefined {
	if (!attribute) return undefined;
	const value = attribute.value as AstNode | undefined;
	return value?.type === 'JSXExpressionContainer' ? (value.expression as AstNode) : undefined;
}

function functionNamed(ast: AstNode, name: string): AstNode | undefined {
	return nodes(ast, 'FunctionDeclaration').find((node) => identifierName(node.id) === name);
}

function declarationNames(declaration: AstNode): string[] {
	const direct = identifierName(declaration.id);
	if (direct) return [direct];
	if (declaration.type === 'VariableDeclaration' && Array.isArray(declaration.declarations)) {
		return (declaration.declarations as AstNode[])
			.map((entry) => identifierName(entry.id))
			.filter((name): name is string => name !== undefined);
	}
	return [];
}

function exportedNames(ast: AstNode): Set<string> {
	const result = new Set<string>();
	const body = Array.isArray(ast.body) ? (ast.body as AstNode[]) : [];
	for (const statement of body) {
		if (statement.type !== 'ExportNamedDeclaration') continue;
		if (statement.declaration && typeof statement.declaration === 'object') {
			for (const name of declarationNames(statement.declaration as AstNode)) result.add(name);
		}
		if (Array.isArray(statement.specifiers)) {
			for (const specifier of statement.specifiers as AstNode[]) {
				const name = identifierName(specifier.exported);
				if (name) result.add(name);
			}
		}
	}
	return result;
}

function expectExports(ast: AstNode, names: string[]): void {
	const actual = exportedNames(ast);
	for (const name of names) expect(actual, `missing named export ${name}`).toContain(name);
}

function keyedFor(root: unknown): AstNode[] {
	return nodes(root, 'JSXForExpression').filter(
		(node) => node.key !== null && node.key !== undefined,
	);
}

function objectProperty(object: AstNode | undefined, name: string): AstNode | undefined {
	if (object?.type !== 'ObjectExpression' || !Array.isArray(object.properties)) return undefined;
	return (object.properties as AstNode[]).find((property) => {
		const key = property.key as AstNode | undefined;
		return identifierName(key) === name || (key?.type === 'Literal' && key.value === name);
	});
}

type Contract = (ast: AstNode, source: string) => void;

const contracts: Record<string, Contract> = {
	'tsrx.counter': (ast) => {
		expectExports(ast, ['App']);
		expect(calls(ast, 'useState')).toHaveLength(1);
		expect(nodes(ast, 'JSXIfExpression')).toHaveLength(1);
		expect(jsxAttributes(ast, 'onClick').length).toBeGreaterThanOrEqual(2);
	},
	'tsrx.packing-list': (ast) => {
		expectExports(ast, ['App']);
		expect(keyedFor(ast).some((node) => node.empty !== null && node.empty !== undefined)).toBe(
			true,
		);
		expect(jsxAttributes(ast, 'onInput').length).toBeGreaterThan(0);
		expect(jsxAttributes(ast, 'onSubmit').length).toBeGreaterThan(0);
	},
	'tsrx.conditional-note': (ast) => {
		expectExports(ast, ['App']);
		const stateCall = calls(ast, 'useState')[0];
		const earlyReturn = nodes(ast, 'IfStatement').find(
			(node) => nodes(node.consequent, 'ReturnStatement').length > 0,
		);
		expect(stateCall).toBeDefined();
		expect(earlyReturn, 'expected a plain early return before useState').toBeDefined();
		expect(earlyReturn?.end ?? Infinity).toBeLessThan(stateCall?.start ?? -1);
	},
	'octane.theme-context': (ast) => {
		expectExports(ast, ['ThemeContext', 'ThemeLabel', 'App']);
		expect(calls(ast, 'createContext')).toHaveLength(1);
		expect(calls(ast, 'use').length).toBeGreaterThan(0);
		expect(
			jsxAttributes(ast, 'class').some((attribute) =>
				['ArrayExpression', 'ObjectExpression'].includes(
					attributeExpression(attribute)?.type ?? '',
				),
			),
		).toBe(true);
	},
	'octane.composed-team-board': (ast) => {
		expectExports(ast, ['Member', 'MemberCard', 'TeamSummary', 'App']);
		const app = functionNamed(ast, 'App');
		expect(jsxElements(app, 'MemberCard').length).toBeGreaterThan(0);
		expect(jsxElements(app, 'TeamSummary').length).toBeGreaterThan(0);
		expect(keyedFor(app).length).toBeGreaterThan(0);
		expect(nodes(functionNamed(ast, 'MemberCard'), 'JSXIfExpression').length).toBeGreaterThan(0);
	},
	'octane.native-inbox': (ast) => {
		expectExports(ast, ['Message', 'MessageRow', 'App']);
		expect(keyedFor(ast).some((node) => node.empty !== null && node.empty !== undefined)).toBe(
			true,
		);
		expect(jsxAttributes(ast, 'onClick').length).toBeGreaterThan(0);
		expect(jsxAttributes(ast, 'onKeyDown').length).toBeGreaterThan(0);
		expect(calls(ast, 'stopPropagation').length).toBeGreaterThan(0);
	},
	'octane.reducer-wizard': (ast) => {
		expectExports(ast, [
			'Plan',
			'WizardState',
			'WizardAction',
			'Confirmation',
			'wizardReducer',
			'ProfileStep',
			'PlanStep',
			'ReviewStep',
			'App',
		]);
		expect(calls(ast, 'useReducer')).toHaveLength(1);
		expect(nodes(ast, 'JSXSwitchExpression')).toHaveLength(1);
		for (const name of ['ProfileStep', 'PlanStep', 'ReviewStep']) {
			expect(jsxElements(functionNamed(ast, 'App'), name).length).toBeGreaterThan(0);
		}
	},
	'octane.native-controlled-search': (ast) => {
		expectExports(ast, ['SearchField', 'App']);
		const input = jsxElements(functionNamed(ast, 'SearchField'), 'input')[0];
		expect(jsxAttributes(input, 'value').length).toBe(1);
		expect(jsxAttributes(input, 'onInput').length).toBe(1);
		expect(jsxAttributes(input, 'defaultValue')).toHaveLength(0);
		expect(jsxAttributes(input, 'onChange')).toHaveLength(0);
	},
	'octane.native-change-intent': (ast) => {
		expectExports(ast, ['PreferenceField', 'App']);
		const app = functionNamed(ast, 'App');
		const inputs = jsxElements(app, 'input');
		const liveInput = inputs.find(
			(input) =>
				jsxAttributes(input, 'value').length === 1 && jsxAttributes(input, 'onInput').length === 1,
		);
		expect(liveInput, 'expected a controlled text input with onInput').toBeDefined();
		expect(jsxAttributes(liveInput, 'onChange')).toHaveLength(0);

		const commitInput = inputs.find((input) => jsxAttributes(input, 'defaultValue').length === 1);
		expect(commitInput, 'expected an uncontrolled commit-on-change text input').toBeDefined();
		expect(jsxAttributes(commitInput, 'onChange')).toHaveLength(1);
		expect(jsxAttributes(commitInput, 'onInput')).toHaveLength(0);
		expect(jsxAttributes(commitInput, 'value')).toHaveLength(0);
		const suppression = jsxAttributes(commitInput, 'suppressNativeChangeWarning');
		expect(suppression).toHaveLength(1);
		const suppressionValue = suppression[0].value as AstNode | null | undefined;
		const suppressionExpression = attributeExpression(suppression[0]);
		expect(
			suppressionValue == null ||
				(suppressionExpression?.type === 'Literal' && suppressionExpression.value === true),
			'expected bare suppressNativeChangeWarning or an explicit true value',
		).toBe(true);

		const checkbox = inputs.find((input) => jsxAttributes(input, 'checked').length === 1);
		expect(checkbox, 'expected a controlled checkbox').toBeDefined();
		expect(jsxAttributes(checkbox, 'onChange')).toHaveLength(1);
		expect(jsxAttributes(jsxElements(app, 'select')[0], 'onChange')).toHaveLength(1);

		const callback = jsxElements(app, 'PreferenceField')[0];
		expect(callback, 'expected the component callback to remain named onChange').toBeDefined();
		expect(jsxAttributes(callback, 'onChange')).toHaveLength(1);

		const spreadInput = inputs.find((input) => nodes(input, 'JSXSpreadAttribute').length > 0);
		expect(spreadInput, 'expected a text input receiving a spread prop bag').toBeDefined();
		const validSpreadBag = nodes(app, 'ObjectExpression').find(
			(object) =>
				objectProperty(object, 'type') !== undefined &&
				objectProperty(object, 'value') !== undefined &&
				objectProperty(object, 'onInput') !== undefined,
		);
		expect(validSpreadBag, 'expected the spread bag to use onInput').toBeDefined();
		const dynamicType = objectProperty(validSpreadBag, 'type')?.value as AstNode | undefined;
		expect(dynamicType, 'expected a type value in the spread bag').toBeDefined();
		expect(
			dynamicType?.type === 'Literal' || dynamicType?.type === 'StringLiteral',
			'expected the spread input type to be computed dynamically',
		).toBe(false);
	},
	'octane.inferred-hook-deps': (ast) => {
		expectExports(ast, ['App']);
		const memos = calls(ast, 'useMemo');
		expect(memos).toHaveLength(2);
		expect(memos.every((call) => callArguments(call).length === 1)).toBe(true);
		const effects = calls(ast, 'useEffect');
		expect(effects).toHaveLength(1);
		expect(callArguments(effects[0])).toHaveLength(1);
	},
	'octane.state-getter': (ast) => {
		expectExports(ast, ['App']);
		const getterState = nodes(ast, 'VariableDeclarator').find((node) => {
			const init = node.init as AstNode | undefined;
			const id = node.id as AstNode | undefined;
			return (
				init?.type === 'CallExpression' &&
				memberName(init.callee) === 'useState' &&
				id?.type === 'ArrayPattern' &&
				Array.isArray(id.elements) &&
				id.elements.length >= 3
			);
		});
		expect(getterState, 'expected the third useState tuple member').toBeDefined();
		expect(calls(ast, 'useRef')).toHaveLength(0);
	},
	'octane.ref-composition': (ast) => {
		expectExports(ast, ['TextField', 'App']);
		const input = jsxElements(functionNamed(ast, 'TextField'), 'input')[0];
		const forwarded = attributeExpression(jsxAttributes(input, 'ref')[0]);
		expect(forwarded?.type).toBe('MemberExpression');
		expect(memberName(forwarded)).toBe('ref');
		const field = jsxElements(functionNamed(ast, 'App'), 'TextField')[0];
		expect(attributeExpression(jsxAttributes(field, 'ref')[0])?.type).toBe('ArrayExpression');
		expect(calls(ast, 'forwardRef')).toHaveLength(0);
	},
	'octane.parallel-use-dashboard': (ast) => {
		expectExports(ast, ['Team', 'TeamStats', 'App']);
		const boundary = nodes(ast, 'JSXTryExpression')[0];
		expect(boundary).toBeDefined();
		const reads = calls(boundary, 'use');
		expect(reads).toHaveLength(2);
		const loaderNames = reads.map((read) => memberName(callArguments(read)[0]?.callee));
		expect(loaderNames).toEqual(['loadTeam', 'loadStats']);
		for (const forbidden of ['all', 'useMemo', 'useEffect', 'useLayoutEffect']) {
			expect(calls(ast, forbidden), `manual coordination through ${forbidden}`).toHaveLength(0);
		}
	},
	'octane.async-product': (ast) => {
		expectExports(ast, ['Product', 'App']);
		const boundary = nodes(ast, 'JSXTryExpression')[0];
		expect(boundary).toBeDefined();
		expect(calls(boundary, 'use')).toHaveLength(1);
	},
	'octane.ssr-signup-card': (ast) => {
		expectExports(ast, ['App']);
		expect(calls(ast, 'useId')).toHaveLength(1);
		expect(jsxAttributes(ast, 'onInput').length).toBeGreaterThan(0);
	},
	'integration.zustand-cart': (ast) => {
		expectExports(ast, ['App']);
		expect(importsFrom(ast, '@octanejs/zustand')).toContain('create');
		const topLevelCreate = (ast.body as AstNode[]).some(
			(statement) => calls(statement, 'create').length > 0,
		);
		expect(topLevelCreate).toBe(true);
	},
	'integration.hook-form-profile': (ast) => {
		expectExports(ast, ['App']);
		expect(importsFrom(ast, '@octanejs/hook-form')).toContain('useForm');
		expect(calls(ast, 'useForm')).toHaveLength(1);
		expect(calls(ast, 'handleSubmit').length).toBeGreaterThan(0);
		expect(
			nodes(ast, 'JSXSpreadAttribute').some(
				(attribute) => memberName((attribute.argument as AstNode)?.callee) === 'register',
			),
		).toBe(true);
	},
	'integration.i18next-switcher': (ast) => {
		expectExports(ast, ['App']);
		const imported = importsFrom(ast, '@octanejs/i18next');
		for (const name of ['I18nextProvider', 'Trans', 'useTranslation'])
			expect(imported).toContain(name);
		expect(calls(ast, 'useTranslation')).toHaveLength(1);
		expect(jsxElements(ast, 'I18nextProvider').length).toBeGreaterThan(0);
		expect(jsxElements(ast, 'Trans').length).toBeGreaterThan(0);
	},
	'integration.query-user-card': (ast) => {
		expectExports(ast, ['App']);
		const imported = importsFrom(ast, '@octanejs/tanstack-query');
		expect(imported).toContain('QueryClientProvider');
		expect(imported).toContain('useQuery');
		expect(jsxElements(ast, 'QueryClientProvider').length).toBeGreaterThan(0);
		const queryCall = calls(ast, 'useQuery')[0];
		const options = callArguments(queryCall)[0];
		expect(objectProperty(options, 'queryKey')).toBeDefined();
		const retry = objectProperty(options, 'retry');
		expect((retry?.value as AstNode | undefined)?.value).toBe(false);
	},
};

function submissionSource(taskId: string): string {
	const submissionRoot = process.env.OCTANE_EVAL_SUBMISSION_ROOT;
	const path = submissionRoot
		? resolve(submissionRoot, taskId, 'src', 'App.tsrx')
		: join(tasksRoot, taskId, 'reference', 'src', 'App.tsrx');
	return readFileSync(path, 'utf8');
}

const selectedTaskId = process.env.OCTANE_EVAL_TASK_ID;
const taskIds = selectedTaskId ? [selectedTaskId] : Object.keys(contracts);

describe('Octane user-app source contracts', () => {
	for (const taskId of taskIds) {
		it(taskId, () => {
			const contract = contracts[taskId];
			expect(contract, `unknown source contract ${taskId}`).toBeDefined();
			const source = submissionSource(taskId);
			contract(parseModule(source, `${taskId}/src/App.tsrx`) as AstNode, source);
		});
	}
});
