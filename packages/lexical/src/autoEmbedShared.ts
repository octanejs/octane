// Typed / agnostic surface of @lexical/react/src/LexicalAutoEmbedPlugin.tsx — the
// types, the URL matcher, the INSERT_EMBED_COMMAND, and the AutoEmbedOption class.
// The component lives in LexicalAutoEmbedPlugin.tsrx.
import type { LexicalCommand, LexicalEditor, LexicalNode } from 'lexical';

import { createCommand } from 'lexical';
import { MenuOption } from './shared/menuShared';

export type EmbedMatchResult<TEmbedMatchResult = unknown> = {
	url: string;
	id: string;
	data?: TEmbedMatchResult;
};

export interface EmbedConfig<
	TEmbedMatchResultData = unknown,
	TEmbedMatchResult = EmbedMatchResult<TEmbedMatchResultData>,
> {
	type: string;
	parseUrl: (text: string) => Promise<TEmbedMatchResult | null> | TEmbedMatchResult | null;
	insertNode: (editor: LexicalEditor, result: TEmbedMatchResult) => void;
}

export const URL_MATCHER =
	/((https?:\/\/(www\.)?)|(www\.))[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/;

export const INSERT_EMBED_COMMAND: LexicalCommand<EmbedConfig['type']> =
	createCommand('INSERT_EMBED_COMMAND');

export class AutoEmbedOption extends MenuOption {
	title: string;
	onSelect: (targetNode: LexicalNode | null) => void;
	constructor(
		title: string,
		options: {
			onSelect: (targetNode: LexicalNode | null) => void;
		},
	) {
		super(title);
		this.title = title;
		this.onSelect = options.onSelect.bind(this);
	}
}
