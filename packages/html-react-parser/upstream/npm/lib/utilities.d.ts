import type { Element } from 'html-dom-parser';
import type { Props } from './attributes-to-props';
/**
 * Check if a tag is a custom component.
 *
 * @see {@link https://github.com/facebook/react/blob/v16.6.3/packages/react-dom/src/shared/isCustomComponent.js}
 *
 * @param tagName - Tag name.
 * @param props - Props passed to the element.
 * @returns - Whether the tag is custom component.
 */
export declare function isCustomComponent(tagName: string, props?: Record<PropertyKey, string>): boolean;
/**
 * Sets style prop.
 *
 * @param style - Inline style.
 * @param props - Props object.
 */
export declare function setStyleProp(style: string, props: Props): void;
/**
 * @see https://reactjs.org/blog/2017/09/08/dom-attributes-in-react-16.html
 */
export declare const PRESERVE_CUSTOM_ATTRIBUTES: boolean;
/**
 * @see https://github.com/facebook/react/blob/cae635054e17a6f107a39d328649137b83f25972/packages/react-dom/src/client/validateDOMNesting.js#L213
 */
export declare const ELEMENTS_WITH_NO_TEXT_CHILDREN: Set<"tr" | "tbody" | "thead" | "tfoot" | "colgroup" | "table" | "head" | "html" | "frameset">;
/**
 * Checks if the given node can contain text nodes
 *
 * @param node - Element node.
 * @returns - Whether the node can contain text nodes.
 */
export declare const canTextBeChildOfNode: (node: Element) => boolean;
/**
 * Returns the first argument as is.
 *
 * @param arg - The argument to be returned.
 * @returns - The input argument `arg`.
 */
export declare const returnFirstArg: <T>(arg: T) => T;
//# sourceMappingURL=utilities.d.ts.map