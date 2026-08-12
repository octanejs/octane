import Editor, { DiffEditor } from '@octanejs/monaco-editor';
import { useState } from 'octane';

export function App() @{
	const [value, setValue] = useState(
		'function greet(name: string) {\n  return `hello ${name}`;\n}\n',
	);
	const [theme, setTheme] = useState<'light' | 'vs-dark'>('light');
	const [language, setLanguage] = useState('typescript');
	const [ready, setReady] = useState(false);

	<main class="app">
		<h1>Monaco Playground</h1>
		<p>Octane binding for Monaco Editor with Vite workers.</p>
		<div class="toolbar">
			<label>
				Theme{' '}
				<select
					aria-label="Theme"
					value={theme}
					onChange={(event) => setTheme(
						(event.currentTarget as HTMLSelectElement).value as 'light' | 'vs-dark',
					)}
				>
					<option value="light">light</option>
					<option value="vs-dark">vs-dark</option>
				</select>
			</label>
			<label>
				Language{' '}
				<select
					aria-label="Language"
					value={language}
					onChange={(event) => setLanguage((event.currentTarget as HTMLSelectElement).value)}
				>
					<option value="typescript">typescript</option>
					<option value="javascript">javascript</option>
					<option value="json">json</option>
				</select>
			</label>
			<span data-testid="ready-flag">{(ready ? 'ready' : 'loading') as string}</span>
		</div>
		<div class="editor-frame" data-editor-ready={ready ? 'true' : 'false'}>
			<Editor
				height="360px"
				theme={theme}
				language={language}
				value={value}
				onChange={(next) => setValue(next ?? '')}
				onMount={(editor) => {
					(globalThis as { __monacoPlaygroundEditor?: unknown }).__monacoPlaygroundEditor = editor;
					setReady(true);
				}}
			/>
		</div>
		<pre class="value-preview" data-testid="value-preview">{value as string}</pre>
		<h2>DiffEditor</h2>
		<div class="diff-frame" data-testid="diff-frame">
			<DiffEditor
				height="280px"
				theme={theme}
				language="typescript"
				original="const a = 1;
"
				modified="const a = 2;
"
			/>
		</div>
	</main>
}
