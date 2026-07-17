// llms.txt (the hand-maintained agent summary the website serves) plus the
// generated llms-full.txt: the same summary followed by the entire docs corpus
// as one plain-text file, for agents that fetch rather than speak MCP.
import llmsTxt from '../../../website/public/llms.txt?raw';
import { DOCS } from './docs.ts';

export const LLMS_TXT: string = llmsTxt;

export const LLMS_FULL_TXT: string =
	llmsTxt.trimEnd() +
	'\n' +
	DOCS.map(
		(doc) =>
			`\n\n---\n\n# ${doc.title}\n\n> ${doc.description}\n> ${doc.url}\n\n${doc.markdown.trim()}`,
	).join('') +
	'\n';
