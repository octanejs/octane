// Ported from @lexical/react/src/LexicalCharacterLimitPlugin.tsx. Tracks text
// length against maxLength, marks overflow, and renders remaining characters. The
// renderer is rendered via createElement (octane renders the descriptor) rather
// than called directly.
import { useLexicalComposerContext } from './LexicalComposerContext';
import { useCharacterLimit } from './shared/useCharacterLimit';
import type { OctaneNode } from 'octane';
import { createElement, useMemo, useState } from 'octane';

const CHARACTER_LIMIT = 5;
let textEncoderInstance: TextEncoder | null = null;

function textEncoder(): TextEncoder | null {
	if (window.TextEncoder === undefined) {
		return null;
	}
	if (textEncoderInstance === null) {
		textEncoderInstance = new window.TextEncoder();
	}
	return textEncoderInstance;
}

function utf8Length(text: string) {
	const currentTextEncoder = textEncoder();
	if (currentTextEncoder === null) {
		const m = encodeURIComponent(text).match(/%[89ABab]/g);
		return text.length + (m ? m.length : 0);
	}
	return currentTextEncoder.encode(text).length;
}

type RendererProps = {
	remainingCharacters: number;
};

function DefaultRenderer(props: RendererProps) @{
	<span
		class={'characters-limit ' + (props.remainingCharacters < 0 ? 'characters-limit-exceeded' : '')}
	>{props.remainingCharacters as unknown as string}</span>
}

type Props = {
	charset?: 'UTF-8' | 'UTF-16';
	maxLength?: number;
	renderer?: (props: RendererProps) => OctaneNode;
};

export function CharacterLimitPlugin(props: Props) {
	const charset = props.charset ?? 'UTF-16';
	const maxLength = props.maxLength ?? CHARACTER_LIMIT;
	const renderer = props.renderer ?? DefaultRenderer;

	const [editor] = useLexicalComposerContext();
	const [remainingCharacters, setRemainingCharacters] = useState(maxLength);

	const characterLimitProps = useMemo(
		() => ({
			remainingCharacters: setRemainingCharacters,
			strlen: (text: string) => {
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
