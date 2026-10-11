import fs from 'node:fs';
import path from 'node:path';

export function writeStaticSources(directory) {
	fs.mkdirSync(directory, { recursive: true });
	const cases = [];
	for (const depth of [1, 3, 5]) {
		for (const layout of ['local', 'imported']) {
			const id = `static-${depth}-${layout}`;
			const folder = path.join(directory, id);
			fs.mkdirSync(folder, { recursive: true });
			function component(level, exported) {
				const parameter = level === 0 ? '' : '{ text }: { text: string }';
				const child =
					level === depth - 1
						? `<span data-value="true">${level === 0 ? 'fixed' : '{text as string}'}</span><em>tail</em>`
						: `<C${level + 1} text=${level === 0 ? '"fixed"' : '{text}'} />`;
				return `${exported ? 'export ' : ''}function C${level}(${parameter}) @{ <div data-layer="${level}">${child}</div> }\n`;
			}
			let prelude = '';
			if (layout === 'local') {
				for (let level = depth - 1; level >= 0; level--) prelude += component(level, false);
			} else {
				prelude = "import { C0 } from './C0.tsrx';\n";
				for (let level = 0; level < depth; level++) {
					const imports =
						level + 1 < depth ? `import { C${level + 1} } from './C${level + 1}.tsrx';\n` : '';
					fs.writeFileSync(path.join(folder, `C${level}.tsrx`), imports + component(level, true));
				}
			}
			fs.writeFileSync(
				path.join(folder, 'App.tsrx'),
				`${prelude}
export function App(props: { rows: readonly { id: number }[]; tick: number }) @{
	<main data-tick={String(props.tick)}>
		@for (const row of props.rows; key row.id) {
			<article data-row={String(row.id)}><input aria-label="draft" defaultValue="seed" /><C0 /></article>
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
