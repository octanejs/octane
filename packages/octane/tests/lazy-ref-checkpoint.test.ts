import { describe, expect, it } from 'vitest';
import { compile } from '../src/compiler/compile.js';

describe('lazy ref setup checkpoint', () => {
	function compiled(body: string) {
		return compile(
			`import { useLazyRef, useState } from 'octane';
			 export function App(props) @{ ${body} <output>{props.label as string}</output> }`,
			'/src/lazy-ref-checkpoint.tsrx',
			{ mode: 'client', dev: false, hmr: false },
		).code;
	}

	it('omits the checkpoint for a visibly pure initializer', () => {
		expect(compiled('const value = useLazyRef(() => ({}));')).not.toContain('__s.block.pending');
	});

	it('keeps the checkpoint when an initializer can schedule an update', () => {
		expect(
			compiled(
				'const [value, setValue] = useState(0); useLazyRef(() => { if (!value) setValue(1); return {}; });',
			),
		).toContain('__s.block.pending');
	});

	it('keeps the checkpoint when the initializer is not statically visible', () => {
		expect(compiled('const value = useLazyRef(props.factory);')).toContain('__s.block.pending');
	});
});
