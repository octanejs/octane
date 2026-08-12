import Editor from '../../../src/Editor';

export function HydratePage(_props: Record<string, never> = {}) @{
	<div id="page">
		<h1>Editor page</h1>
		<div id="editor-slot">
			<Editor height="240px" defaultLanguage="javascript" defaultValue="const x = 1;" />
		</div>
	</div>
}
