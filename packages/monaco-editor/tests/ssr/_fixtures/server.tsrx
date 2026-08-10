import Editor from '../../../src/Editor';
import DiffEditor from '../../../src/DiffEditor';

export function ServerEditor(_props: Record<string, never> = {}) @{
	<div>
		<h1>Editor page</h1>
		<Editor height="240px" defaultLanguage="javascript" defaultValue="const x = 1;" />
	</div>
}

export function ServerDiffEditor(_props: Record<string, never> = {}) @{
	<div>
		<DiffEditor height="240px" original="a" modified="b" language="plaintext" />
	</div>
}
