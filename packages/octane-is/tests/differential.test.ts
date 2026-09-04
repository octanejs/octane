import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import * as Octane from 'octane';
import * as Is from '../src/index.js';

const oracleRequire = createRequire(resolve(import.meta.dirname, '../../octane/package.json'));
const React = oracleRequire('react');
const ReactDOM = oracleRequire('react-dom');
const ReactIs = oracleRequire('../octane-is/upstream-artifact/package/index.js');

// @parity-case differential:octane-is-supported-surface
it('matches every predicate for corresponding supported element values', () => {
	expect(React.version).toBe('19.2.7');
	expect(Object.keys(Is).sort()).toEqual(Object.keys(ReactIs).sort());
	const target = document.createElement('div');
	const values = (runtime: typeof Octane, portal: typeof Octane.createPortal) => {
		const C = () => null;
		return [
			null,
			false,
			1,
			'text',
			{},
			runtime.createElement('div'),
			runtime.createElement(C),
			runtime.createElement(runtime.Fragment),
			runtime.createElement(runtime.StrictMode),
			runtime.createElement(runtime.Suspense),
			runtime.createElement(runtime.memo(C)),
			runtime.createElement(runtime.lazy(async () => C)),
			runtime.createElement(runtime.createContext(null).Provider),
			portal(runtime.createElement('span'), target),
		];
	};
	const octane = values(Octane, Octane.createPortal);
	const react = values(React, ReactDOM.createPortal);
	const predicates = Object.keys(Is).filter((name) => name.startsWith('is')) as Array<
		keyof typeof Is
	>;
	for (let index = 0; index < octane.length; index++) {
		for (const name of predicates) {
			const predicate = Is[name] as (value: unknown) => boolean;
			expect(predicate(octane[index]), `${name} value ${index}`).toBe(ReactIs[name](react[index]));
		}
		const kind = Is.typeOf(octane[index]);
		const name = Object.keys(Is).find((name) => Is[name as keyof typeof Is] === kind);
		expect(ReactIs.typeOf(react[index])).toBe(name === undefined ? undefined : ReactIs[name]);
	}
});
