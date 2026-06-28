import { LexicalComposer } from '@octanejs/lexical/LexicalComposer';
import { useLexicalComposerContext } from '@octanejs/lexical/LexicalComposerContext';
import { useEffect } from 'octane';

// Mounts a LexicalComposer with a caller-supplied initialConfig and hands the
// composer context ([editor, theme]) back — for porting LexicalComposer.test.tsx.
function Probe(props) {
	const ctx = useLexicalComposerContext();
	useEffect(() => {
		props.onContext(ctx);
	}, [ctx]);
	return null;
}

export function ComposerProbe(props) @{
	<LexicalComposer initialConfig={props.initialConfig}>
		<Probe onContext={props.onContext} />
	</LexicalComposer>
}
