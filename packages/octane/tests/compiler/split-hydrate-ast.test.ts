import { describe, expect, it } from 'vitest';
import { compile } from '../../src/compiler/compile.js';
import { decodeMappings } from '../_source-map.js';

const filename = '/project/split-mapped.tsrx';

describe('split Hydrate compiler artifacts', () => {
	for (const child of [
		'<p data-label={local}>mapped</p>',
		'<><p data-label={local}>mapped</p><style>p { color: red; }</style></>',
		'@if (local) { <p data-label={local}>mapped</p> } @else { <p>empty</p> }',
	]) {
		it(`preserves authored capture mappings and query provenance for ${child.slice(0, 25)}`, () => {
			const source = `import {Hydrate as Deferred} from 'octane';\nexport function App(props) @{\n const local=props.label;\n <Deferred when={props.when}>${child}</Deferred>\n}`;
			const client = compile(source, filename, { dev: false, hmr: false });
			const query = compile(source, filename + '?octane-hydrate=0', { dev: false, hmr: false });
			const server = compile(source, filename, { mode: 'server', dev: false, hmr: false });
			expect(client.map.sourcesContent).toEqual([source]);
			expect(query.map.sourcesContent).toEqual([source]);
			expect(server.map.sourcesContent).toEqual([source]);
			expect(query.code).toContain('data-label');
			expect(server.code).toContain('data-label');
			const offset = query.code.lastIndexOf('local');
			expect(offset).toBeGreaterThanOrEqual(0);
			const prefix = query.code.slice(0, offset).split('\n'),
				line = prefix.length - 1,
				column = prefix.at(-1)!.length;
			const segments = decodeMappings(query.map.mappings)[line];
			const mapped = segments
				.filter((segment) => segment.length >= 4 && segment[0] <= column)
				.at(-1)!;
			expect(source.split('\n')[mapped[2]]).toContain('data-label={local}');
		});
	}
	it('preserves existing function-child extraction diagnostics', () => {
		const source =
			"import {Hydrate}from'octane';export function App() @{<Hydrate>{()=> <p>render prop</p>}</Hydrate>}";
		for (const dev of [false, true])
			expect(() => compile(source, filename, { dev, hmr: false })).toThrow(
				'function children cannot be split',
			);
	});
});
