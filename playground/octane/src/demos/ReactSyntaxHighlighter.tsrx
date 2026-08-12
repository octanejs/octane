import { Prism } from '@octanejs/syntax-highlighter';
import vscDarkPlus from '@octanejs/syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus';

const source = `type Binding = {
  framework: 'Octane';
  parity: true;
};

const binding: Binding = {
  framework: 'Octane',
  parity: true,
};`;

export function ReactSyntaxHighlighterDemo() @{
	<section style={{ display: 'grid', gap: '12px', maxWidth: '760px' }}>
		<h2 style={{ margin: 0 }}>React Syntax Highlighter</h2>
		<p style={{ margin: 0 }}>
			Prism highlighting, line numbers, wrapping, and the published theme imports.
		</p>
		<Prism
			language="typescript"
			style={vscDarkPlus}
			showLineNumbers
			wrapLines
			customStyle={{ borderRadius: '10px', margin: 0, padding: '18px' }}
			children={source}
		/>
	</section>
}
