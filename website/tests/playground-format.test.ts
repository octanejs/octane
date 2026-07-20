// Client-side Prettier wrapper — the Format button's contract: repo-style
// output (tabs, single quotes) for both dialects, idempotence, and parse
// errors reported instead of thrown.
import { describe, it, expect } from 'vitest';
import { formatPlaygroundFile } from '../src/lib/playground-format.ts';

describe('formatPlaygroundFile', () => {
	it('formats TSRX to repo style (tabs, single quotes) and is idempotent', async () => {
		const messy =
			'import {useState} from "octane"\nexport default function App() @{ const [n,setN]=useState(0);\n<button onClick={()=>setN(n+1)}>{\'n: \'+n}</button> }';
		const first = await formatPlaygroundFile('App.tsrx', messy);
		expect(first.ok).toBe(true);
		if (!first.ok) return;
		expect(first.code).toContain("from 'octane'");
		expect(first.code).toContain('\tconst [n, setN] = useState(0);');
		const second = await formatPlaygroundFile('App.tsrx', first.code);
		expect(second).toEqual(first);
	});

	it('formats TSX and React-host files with the typescript parser', async () => {
		for (const name of ['App.tsx', 'App.react.tsx']) {
			const result = await formatPlaygroundFile(
				name,
				'export default function App(){return (<div className="a">hi</div>)}',
			);
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.code).toContain('\treturn <div className="a">hi</div>;');
		}
	});

	it('reports parse errors instead of throwing', async () => {
		const result = await formatPlaygroundFile(
			'App.tsrx',
			'export default function App() @{ <div> }',
		);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
	});
});
