// Ported from styled-components 6.4.3 (MIT), adapted for octane.
//
// On octane, SSR style collection is AUTOMATIC: every server-side style insert
// forwards to octane's per-request css channel, so `renderToString` returns
// `{ html, css }` and streaming interleaves styles without any setup. This
// class is a compatibility shim for upstream-style code: its capture sheet
// additionally accumulates rules in-memory so `getStyleTags()` /
// `getStyleElement()` keep working. `interleaveWithNodeStream` is not
// supported — octane's `renderToPipeableStream` already streams styles.
import { createElement } from 'octane';

import { SC_ATTR, SC_ATTR_VERSION, SC_VERSION } from '../constants';
import StyleSheet from '../sheet';
import styledError from '../utils/error';
import { joinStringArray } from '../utils/joinStrings';
import getNonce from '../utils/nonce';
import { StyleSheetManager } from './StyleSheetManager';

export default class ServerStyleSheet {
	instance: StyleSheet;
	sealed: boolean;

	constructor({ nonce }: { nonce?: string } = {}) {
		this.instance = new StyleSheet({ isServer: true, capture: true, nonce });
		this.sealed = false;
	}

	_emitSheetCSS = (): string => {
		const css = this.instance.toString();
		if (!css) return '';
		const nonce = this.instance.options.nonce || getNonce();
		const attrs = [
			nonce && `nonce="${nonce}"`,
			`${SC_ATTR}="true"`,
			`${SC_ATTR_VERSION}="${SC_VERSION}"`,
		];
		const htmlAttr = joinStringArray(attrs.filter(Boolean) as string[], ' ');

		return `<style ${htmlAttr}>${css}</style>`;
	};

	collectStyles(children: any): unknown {
		if (this.sealed) {
			throw styledError(2);
		}

		return createElement(StyleSheetManager as any, { sheet: this.instance, children });
	}

	getStyleTags = (): string => {
		if (this.sealed) {
			throw styledError(2);
		}

		return this._emitSheetCSS();
	};

	getStyleElement = () => {
		if (this.sealed) {
			throw styledError(2);
		}

		const css = this.instance.toString();
		if (!css) return [];

		const props: Record<string, any> = {
			[SC_ATTR]: '',
			[SC_ATTR_VERSION]: SC_VERSION,
			dangerouslySetInnerHTML: {
				__html: css,
			},
		};

		const nonce = this.instance.options.nonce || getNonce();
		if (nonce) {
			props.nonce = nonce;
		}

		// v4 returned an array for this fn, so we'll do the same for v5 for backward compat
		return [createElement('style', { ...props, key: 'sc-0-0' })];
	};

	interleaveWithNodeStream(_input: unknown): never {
		// OCTANE DIVERGENCE: octane's renderToPipeableStream already emits each
		// pass's style chunks ahead of its html, so there is nothing to interleave.
		throw styledError(3);
	}

	seal = (): void => {
		this.sealed = true;
	};
}
