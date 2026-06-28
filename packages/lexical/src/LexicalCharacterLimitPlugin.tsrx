// Ported from @lexical/react/src/LexicalCharacterLimitPlugin.tsx. Tracks text
// length against maxLength, marks overflow, and renders remaining characters. The
// renderer is rendered via createElement (octane renders the descriptor) rather
// than called directly.
import { useLexicalComposerContext } from './LexicalComposerContext';
import { useCharacterLimit } from './shared/useCharacterLimit';
import { createElement, useMemo, useState } from 'octane';

const CHARACTER_LIMIT = 5;
let textEncoderInstance = null;

function textEncoder() {
	if (window.TextEncoder === undefined) {
		return null;
	}
	if (textEncoderInstance === null) {
		textEncoderInstance = new window.TextEncoder();
	}
	return textEncoderInstance;
}

function utf8Length(text) {
	const currentTextEncoder = textEncoder();
	if (currentTextEncoder === null) {
		const m = encodeURIComponent(text).match(/%[89ABab]/g);
		return text.length + (m ? m.length : 0);
	}
	return currentTextEncoder.encode(text).length;
}

function DefaultRenderer(props) @{
	<span
		class={'characters-limit ' + (props.remainingCharacters < 0 ? 'characters-limit-exceeded' : '')}
	>
		{props.remainingCharacters as string}
	</span>
}

export function CharacterLimitPlugin(props) {
	const charset = props.charset ?? 'UTF-16';
	const maxLength = props.maxLength ?? CHARACTER_LIMIT;
	const renderer = props.renderer ?? DefaultRenderer;

	const [editor] = useLexicalComposerContext();
	const [remainingCharacters, setRemainingCharacters] = useState(maxLength);

	const characterLimitProps = useMemo(
		() => ({
			remainingCharacters: setRemainingCharacters,
			strlen: (text) => {
				if (charset === 'UTF-8') {
					return utf8Length(text);
				} else if (charset === 'UTF-16') {
					return text.length;
				} else {
					throw new Error('Unrecognized charset');
				}
			},
		}),
		[charset],
	);

	useCharacterLimit(editor, maxLength, characterLimitProps);

	return createElement(renderer, { remainingCharacters });
}
