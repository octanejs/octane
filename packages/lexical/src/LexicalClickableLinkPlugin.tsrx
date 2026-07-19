// Ported from @lexical/react/src/LexicalClickableLinkPlugin.tsx.
import { namedSignals } from '@lexical/extension';
import { registerClickableLink } from '@lexical/link';
import { useLexicalComposerContext } from './LexicalComposerContext';
import { useEffect } from 'octane';

type Props = {
	newTab?: boolean;
	disabled?: boolean;
};

export function ClickableLinkPlugin(props: Props) {
	const [editor] = useLexicalComposerContext();
	const newTab = props.newTab !== false;
	const disabled = props.disabled === true;
	useEffect(() => registerClickableLink(editor, namedSignals({ disabled, newTab })), [
		editor,
		newTab,
		disabled,
	]);
	return null;
}
