import './monaco-env';
import Editor, { DiffEditor } from '@octanejs/monaco-editor';
import { createRoot, useState } from 'octane';

type HarnessEditor = {
	getValue(): string;
	getModel(): { getLanguageId(): string; getFullModelRange(): unknown } | null;
	executeEdits(source: string, edits: Array<{ range: unknown; text: string }>): void;
	pushUndoStop(): void;
};

function setHarnessEditor(editorInstance: HarnessEditor) {
	(globalThis as { __monacoHarnessEditor?: HarnessEditor }).__monacoHarnessEditor = editorInstance;
}

function App() @{
	const [value, setValue] = useState('const answer = 42;\n');
	const [ready, setReady] = useState(false);
	const [mounted, setMounted] = useState(true);
	const [theme, setTheme] = useState('light');
	const [language, setLanguage] = useState('typescript');

	<div>
		<h1>Monaco browser harness</h1>
		<button
			type="button"
			data-testid="remount"
			onClick={() => {
				setReady(false);
				setMounted(false);
				queueMicrotask(() => setMounted(true));
			}}
		>
			Remount
		</button>
		<label>
			Theme{' '}
			<select
				aria-label="Harness theme"
				data-testid="theme"
				value={theme}
				onChange={(event) => setTheme((event.currentTarget as HTMLSelectElement).value)}
			>
				<option value="light">light</option>
				<option value="vs-dark">vs-dark</option>
			</select>
		</label>
		<label>
			Language{' '}
			<select
				aria-label="Harness language"
				data-testid="language"
				value={language}
				onChange={(event) => setLanguage((event.currentTarget as HTMLSelectElement).value)}
			>
				<option value="typescript">typescript</option>
				<option value="javascript">javascript</option>
				<option value="json">json</option>
			</select>
		</label>
		<div class="editor-host" data-editor-ready={ready ? 'true' : 'false'}>
			@if (mounted) {
				<Editor
					height="320px"
					language={language}
					theme={theme}
					value={value}
					onChange={(next) => setValue(next ?? '')}
					onMount={(editorInstance) => {
						setHarnessEditor(editorInstance as HarnessEditor);
						setReady(true);
					}}
				/>
			}
		</div>
		<section data-testid="diff-host" style={{ height: '200px' }}>
			<DiffEditor height="200px" original="a" modified="b" language="plaintext" theme={theme} />
		</section>
		<pre data-testid="value">{value as string}</pre>
		<span data-testid="theme-flag">{theme as string}</span>
		<span data-testid="language-flag">{language as string}</span>
	</div>
}

const root = createRoot(document.getElementById('root')!);
root.render(App);
