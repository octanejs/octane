import fs from 'node:fs';
import path from 'node:path';

export function writeSources(directory, scenario = 'static') {
	if (!['static', 'dynamic', 'delegation', 'exported-entry', 'exported-example'].includes(scenario))
		throw new Error('Unknown scenario');
	fs.mkdirSync(directory, { recursive: true });
	if (scenario === 'delegation') return writeDelegationSources(directory);
	if (scenario === 'exported-example') {
		fs.writeFileSync(
			path.join(directory, 'App.tsrx'),
			`import { useState } from 'octane'; function Child({ text }) @{ <div>{text}</div> } export default function App() @{ <Child text="123" /> }`,
		);
		return [{ id: scenario, shape: 'example', depth: 1, layout: 'local' }];
	}
	const cases = [];
	for (const depth of [1, 3, 5]) {
		for (const layout of ['local', 'imported']) {
			const id = `${scenario}-${depth}-${layout}`;
			const folder = path.join(directory, id);
			fs.mkdirSync(folder, { recursive: true });
			function component(level, exported) {
				const fixedEntry = (scenario === 'static' || scenario === 'exported-entry') && level === 0;
				const parameter = fixedEntry ? '' : '{ text }: { text: string }';
				const child =
					level === depth - 1
						? `<span data-value="true">${fixedEntry ? 'fixed' : '{text as string}'}</span><em>tail</em>`
						: `<C${level + 1} text=${fixedEntry ? '"fixed"' : '{text}'} />`;
				return `${exported ? 'export ' : ''}function C${level}(${parameter}) @{ <div data-layer="${level}">${child}</div> }\n`;
			}
			let prelude = '';
			if (layout === 'local') {
				for (let level = depth - 1; level >= 0; level--)
					prelude += component(level, scenario === 'exported-entry' && level === 0);
			} else {
				prelude = "import { C0 } from './C0.tsrx';\n";
				for (let level = 0; level < depth; level++) {
					const imports =
						level + 1 < depth ? `import { C${level + 1} } from './C${level + 1}.tsrx';\n` : '';
					fs.writeFileSync(path.join(folder, `C${level}.tsrx`), imports + component(level, true));
				}
			}
			const entry = scenario === 'dynamic' ? '<C0 text={`${props.text}`} />' : '<C0 />';
			fs.writeFileSync(
				path.join(folder, 'App.tsrx'),
				`${prelude}
export function App(props: { rows: readonly { id: number }[]; tick: number${scenario === 'dynamic' ? '; text: string' : ''} }) @{
	<main data-tick={String(props.tick)}>
		@for (const row of props.rows; key row.id) {
			<article data-row={String(row.id)}><input aria-label="draft" defaultValue="seed" />${entry}</article>
		}
	</main>
}
`,
			);
			cases.push({ id, shape: 'wrapped', depth, layout });
		}
	}
	const imports = cases
		.map((item, index) => `import { App as A${index} } from './${item.id}/App.tsrx';`)
		.join('\n');
	fs.writeFileSync(
		path.join(directory, 'registry.ts'),
		`${imports}\nexport const cases = [${cases.map((item, index) => `{ ...${JSON.stringify(item)}, App: A${index} }`).join(',\n')}];\n`,
	);
	return cases;
}

function writeDelegationSources(directory) {
	const cases = [];
	for (const depth of [0, 1, 3, 5]) {
		for (const layout of ['local', 'imported']) {
			const id = `delegation-${depth}-${layout}`;
			const folder = path.join(directory, id);
			fs.mkdirSync(folder, { recursive: true });
			const child = `function Child(props: { text: string; rowId: number }) @{
	const [count, setCount] = useState(0);
	<div data-leaf="true" data-child-row={props.rowId as number}>
		<button data-action="increment" onClick={() => setCount(count + 1)}>{count as string}</button>
		<span data-value="true">{props.text as string}</span><em>tail</em>
	</div>
}
`;
			const next = (level) => (level + 1 === depth ? 'Child' : `C${level + 1}`);
			const wrapper = (level, exported) =>
				`${exported ? 'export ' : ''}function C${level}(props: { text: string; rowId: number }) @{ <${next(level)} {...props} /> }\n`;
			const entry = depth === 0 ? 'Child' : 'C0';
			let prelude;
			if (layout === 'local') {
				prelude = "import { useState } from 'octane';\n" + child;
				for (let level = depth - 1; level >= 0; level--) prelude += wrapper(level, false);
			} else {
				prelude = `import { ${entry} } from './${entry}.tsrx';\n`;
				fs.writeFileSync(
					path.join(folder, 'Child.tsrx'),
					"import { useState } from 'octane';\nexport " + child,
				);
				for (let level = 0; level < depth; level++)
					fs.writeFileSync(
						path.join(folder, `C${level}.tsrx`),
						`import { ${next(level)} } from './${next(level)}.tsrx';\n` + wrapper(level, true),
					);
			}
			fs.writeFileSync(
				path.join(folder, 'App.tsrx'),
				`${prelude}
export function App(props: { rows: readonly { id: number }[]; tick: number; text: string }) @{
	<main data-tick={String(props.tick)}>
		@for (const row of props.rows; key row.id) {
			<article data-row={String(row.id)}><input aria-label="draft" defaultValue="seed" /><${entry} text={\`\${props.text}\`} rowId={row.id} /></article>
		}
	</main>
}
`,
			);
			cases.push({ id, shape: 'delegating', depth, wrapperCount: depth, layout });
		}
	}
	const imports = cases
		.map((item, index) => `import { App as A${index} } from './${item.id}/App.tsrx';`)
		.join('\n');
	fs.writeFileSync(
		path.join(directory, 'registry.ts'),
		`${imports}\nexport const cases = [${cases.map((item, index) => `{ ...${JSON.stringify(item)}, App: A${index} }`).join(',\n')}];\n`,
	);
	return cases;
}
