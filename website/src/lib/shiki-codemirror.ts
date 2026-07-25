// CodeMirror syntax highlighting through Shiki + the real TSRX TextMate
// grammar — same approach as the reference TSRX playground. CodeMirror has no
// TSRX Lezer grammar, so instead of a language mode the editor re-tokenizes the
// whole document with Shiki on change and paints the themed token colors as
// mark decorations. Highlighting is async (the highlighter loads lazily); a
// version counter drops stale results.
//
// Client-only: imports the WASM-backed `shiki` bundle — load this module (and
// everything that pulls it in) via dynamic import from an effect.
import {
	EditorView,
	Decoration,
	ViewPlugin,
	type DecorationSet,
	type ViewUpdate,
} from '@codemirror/view';
import { type Extension, StateEffect, StateField } from '@codemirror/state';
import { createHighlighter, type ThemedToken, type Highlighter } from 'shiki';
import tsrxGrammar from '../assets/tsrx.tmLanguage.json';

// Match the site's MDX code fences (mdx-options.ts): the SAME dual light/dark
// theme pair, emitted as `--shiki-light`/`--shiki-dark` custom properties per
// token so the active site theme picks the color via CSS (the `.cm-shiki`
// rules in __root.tsrx's BASE_STYLES) — no re-tokenize on theme flip. The
// TSRX grammar is registered with embedded JSX/TS/CSS islands as 'tsrx'.
export const PLAYGROUND_SHIKI_THEMES = {
	light: 'github-light',
	dark: 'github-dark-high-contrast',
} as const;

const modifiedTsrxGrammar = {
	...(tsrxGrammar as object),
	embeddedLangs: ['jsx', 'tsx', 'css'],
};

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
	if (!highlighterPromise) {
		highlighterPromise = createHighlighter({
			themes: [PLAYGROUND_SHIKI_THEMES.light, PLAYGROUND_SHIKI_THEMES.dark],
			langs: [
				'javascript',
				'typescript',
				'jsx',
				'tsx',
				'css',
				{ ...modifiedTsrxGrammar, name: 'tsrx' } as any,
			],
		});
	}
	return highlighterPromise;
}

// Re-highlighting allocates per TOKEN (thousands per document, every
// keystroke), but the number of distinct token styles is bounded by the
// theme palette (a few dozen pairs) — so mark decorations are interned by
// their style string and reused across tokens, documents, and re-highlights.
const tokenDecorations = new Map<string, Decoration>();

function tokenDecoration(style: Record<string, string>): Decoration {
	// With defaultColor: false the per-theme colors arrive as custom
	// properties in htmlStyle; the stylesheet maps them to `color`. The
	// serialized declaration doubles as the intern key.
	let styleText = '';
	for (const property in style) styleText += `${property}:${style[property]};`;
	let deco = tokenDecorations.get(styleText);
	if (!deco) {
		deco = Decoration.mark({ class: 'cm-shiki', attributes: { style: styleText } });
		tokenDecorations.set(styleText, deco);
	}
	return deco;
}

function buildDecorations(doc: string, highlighter: Highlighter, lang: string): DecorationSet {
	if (!doc) return Decoration.none;

	let tokens: ThemedToken[][];
	try {
		tokens = highlighter.codeToTokens(doc, {
			lang: lang as any,
			themes: PLAYGROUND_SHIKI_THEMES,
			defaultColor: false,
		}).tokens;
	} catch {
		return Decoration.none;
	}

	const ranges: { from: number; to: number; deco: Decoration }[] = [];
	for (const line of tokens) {
		for (const token of line) {
			const from = token.offset;
			const to = from + token.content.length;
			const style = token.htmlStyle;
			if (style && to <= doc.length) {
				ranges.push({ from, to, deco: tokenDecoration(style) });
			}
		}
	}

	ranges.sort((a, b) => a.from - b.from || a.to - b.to);
	return Decoration.set(ranges.map((r) => r.deco.range(r.from, r.to)));
}

const setDecorations = StateEffect.define<DecorationSet>();

/**
 * A CodeMirror extension that highlights the document with Shiki using the
 * given language (`'tsrx'` | `'tsx'` | any bundled lang above). The language is
 * fixed per extension instance — swap it with a Compartment reconfigure.
 */
export function shikiHighlight(lang: string): Extension {
	const field = StateField.define<DecorationSet>({
		create() {
			return Decoration.none;
		},
		update(value, tr) {
			for (const effect of tr.effects) {
				if (effect.is(setDecorations)) return effect.value;
			}
			// Keep marks anchored while async re-highlight is in flight.
			return tr.docChanged ? value.map(tr.changes) : value;
		},
		provide: (f) => EditorView.decorations.from(f),
	});

	const plugin = ViewPlugin.define((view) => {
		let disposed = false;
		let pendingVersion = 0;

		function highlight(v: EditorView) {
			const doc = v.state.doc.toString();
			const version = ++pendingVersion;
			getHighlighter().then((h) => {
				if (disposed || pendingVersion !== version) return;
				v.dispatch({ effects: setDecorations.of(buildDecorations(doc, h, lang)) });
			});
		}

		highlight(view);

		return {
			update(update: ViewUpdate) {
				if (update.docChanged) highlight(update.view);
			},
			destroy() {
				disposed = true;
			},
		};
	});

	return [field, plugin];
}
