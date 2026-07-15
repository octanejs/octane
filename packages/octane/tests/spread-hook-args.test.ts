import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';
import { mount } from './_helpers';
import { SpreadHookArgs } from './_fixtures/spread-hook-args.tsrx';

describe('spread hook arguments', () => {
	it('preserves zero/one-argument state and two/three-argument reducer semantics', () => {
		const r = mount(SpreadHookArgs);
		expect(r.findAll('button').map((button) => button.textContent)).toEqual(['u', '5', '1', '4']);
		r.click('.empty');
		r.click('.one');
		r.click('.reduced');
		r.click('.lazy');
		expect(r.findAll('button').map((button) => button.textContent)).toEqual(['3', '6', '3', '7']);
		r.unmount();
	});

	it('retains self-identifying Symbols only at production spread sites', () => {
		const { code } = compile(
			`import { useState } from 'octane';
			 export function App() @{ const args = [] as const; const [n] = useState(...args); <p>{n as string}</p> }`,
			'spread-prod.tsrx',
			{ hmr: false },
		);
		expect(code).toMatch(/const _h\$0 = Symbol\(_hs\$\);/);
		expect(code).toContain('useState(...args, _h$0)');
	});
});
