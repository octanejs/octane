import type { DOMNode } from 'html-dom-parser';
import type { JSX } from 'react';
import type { HTMLReactParserOptions } from './types';
/**
 * Converts DOM nodes to JSX element(s).
 *
 * @param nodes - DOM nodes.
 * @param options - Options.
 * @returns - String or JSX element(s).
 */
export default function domToReact(nodes: DOMNode[], options?: HTMLReactParserOptions): string | JSX.Element | JSX.Element[];
//# sourceMappingURL=dom-to-react.d.ts.map