import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import ts from 'typescript';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Octane from 'octane';
import * as OctaneIs from '../src/index.js';

const oracleRequire = createRequire(resolve(import.meta.dirname, '../../octane/package.json'));
const React = oracleRequire('react');
const ReactDOM = oracleRequire('react-dom');
const ReactIs = oracleRequire('../octane-is/upstream-artifact/package/index.js');
if (React.version !== '19.2.7') throw new Error('The pristine React oracle must be 19.2.7');

/** Execute pinned test bytes with syntax-only JSX lowering and the upstream stable feature gate. */
export function registerUpstream(sourcePath: string, adapted: boolean): void {
	const source = readFileSync(sourcePath, 'utf8');
	const code = ts.transpileModule(source, {
		compilerOptions: {
			jsx: ts.JsxEmit.React,
			jsxFactory: 'React.createElement',
			jsxFragmentFactory: 'React.Fragment',
			target: ts.ScriptTarget.ESNext,
		},
	}).outputText;
	const runtime = adapted ? Octane : React;
	const introspection = adapted ? OctaneIs : ReactIs;
	const require = (specifier: string): unknown => {
		if (specifier === 'react' || specifier === 'octane') return runtime;
		if (specifier === 'react-dom') return ReactDOM;
		if (specifier === 'react-is' || specifier === '@octanejs/octane-is') return introspection;
		throw new Error(`Unexpected upstream import: ${specifier}`);
	};
	const register = (title: string, callback: () => void): void => {
		// React's upstream harness applies @gate enableSuspenseList to this case;
		// 19.2.7 stable does not expose the experimental component. The adaptation
		// executes its explicit unsupported-kind negative control instead.
		if (!adapted && title === 'should identify suspense list') return;
		it(title, callback);
	};
	// react-is has no mutable module state; resetModules in its Jest beforeEach
	// only reimports the same symbol constants. Every test still creates new values.
	new Function('describe', 'it', 'expect', 'beforeEach', 'jest', 'gate', 'require', code)(
		describe,
		register,
		expect,
		beforeEach,
		{ fn: vi.fn, resetModules() {} },
		() => false,
		require,
	);
}
