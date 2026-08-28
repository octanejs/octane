"use strict";
/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = domToReact;
const domhandler_1 = require("domhandler");
const react_1 = require("react");
const attributes_to_props_1 = __importDefault(require("./attributes-to-props"));
const utilities_1 = require("./utilities");
const React = {
    cloneElement: react_1.cloneElement,
    createElement: react_1.createElement,
    isValidElement: react_1.isValidElement,
};
/**
 * Converts DOM nodes to JSX element(s).
 *
 * @param nodes - DOM nodes.
 * @param options - Options.
 * @returns - String or JSX element(s).
 */
function domToReact(nodes, options = {}) {
    var _a, _b, _c, _d, _e;
    const reactElements = [];
    const hasReplace = typeof options.replace === 'function';
    const transform = (_a = options.transform) !== null && _a !== void 0 ? _a : utilities_1.returnFirstArg;
    const { cloneElement, createElement, isValidElement } = (_b = options.library) !== null && _b !== void 0 ? _b : React;
    const nodesLength = nodes.length;
    normalizeDOMNodes(nodes);
    for (let index = 0; index < nodesLength; index++) {
        const node = nodes[index];
        // replace with custom React element (if present)
        if (hasReplace) {
            let replaceElement = (_c = options.replace) === null || _c === void 0 ? void 0 : _c.call(options, node, index);
            if (isValidElement(replaceElement)) {
                // set "key" prop for sibling elements
                // https://react.dev/learn/rendering-lists#rules-of-keys
                if (nodesLength > 1) {
                    replaceElement = cloneElement(replaceElement, {
                        key: (_d = replaceElement.key) !== null && _d !== void 0 ? _d : index,
                    });
                }
                reactElements.push(transform(replaceElement, node, index));
                continue;
            }
        }
        if (node.type === 'text') {
            const isWhitespace = !node.data.trim().length;
            // We have a whitespace node that can't be nested in its parent
            // so skip it
            if (isWhitespace &&
                node.parent &&
                !(0, utilities_1.canTextBeChildOfNode)(node.parent)) {
                continue;
            }
            // Trim is enabled and we have a whitespace node
            // so skip it
            if (options.trim && isWhitespace) {
                continue;
            }
            // We have a text node that's not whitespace and it can be nested
            // in its parent so add it to the results
            reactElements.push(transform(node.data, node, index));
            continue;
        }
        const element = node;
        let props = {};
        if (skipAttributesToProps(element)) {
            (0, utilities_1.setStyleProp)(element.attribs.style, element.attribs);
            props = element.attribs;
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        }
        else if (element.attribs) {
            props = (0, attributes_to_props_1.default)(element.attribs, element.name);
        }
        let children;
        switch (node.type) {
            case 'script':
            case 'style':
                // prevent text in <script> or <style> from being escaped
                // https://react.dev/reference/react-dom/components/common#dangerously-setting-the-inner-html
                if (node.children[0]) {
                    props.dangerouslySetInnerHTML = {
                        __html: node.children[0].data,
                    };
                }
                break;
            case 'tag':
                // setting textarea value in children is an antipattern in React
                // https://react.dev/reference/react-dom/components/textarea#caveats
                if (node.name === 'textarea' && node.children[0]) {
                    props.defaultValue = node.children[0].data;
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                }
                else if ((_e = node.children) === null || _e === void 0 ? void 0 : _e.length) {
                    // continue recursion of creating React elements (if applicable)
                    children = domToReact(node.children, options);
                }
                break;
            // skip all other cases (e.g., comment)
            default:
                continue;
        }
        // set "key" prop for sibling elements
        // https://react.dev/learn/rendering-lists#rules-of-keys
        if (nodesLength > 1) {
            props.key = index;
        }
        reactElements.push(transform(createElement(node.name, props, children), node, index));
    }
    return reactElements.length === 1 ? reactElements[0] : reactElements;
}
function normalizeDOMNodes(nodes) {
    for (const node of nodes) {
        if (node.type === 'tag' ||
            node.type === 'script' ||
            node.type === 'style') {
            Object.setPrototypeOf(node, domhandler_1.Element.prototype);
            normalizeDOMNodes(node.children);
        }
    }
}
/**
 * Determines whether DOM element attributes should be transformed to props.
 * Web Components should not have their attributes transformed except for `style`.
 *
 * @param node - Element node.
 * @returns - Whether the node attributes should be converted to props.
 */
function skipAttributesToProps(node) {
    return (utilities_1.PRESERVE_CUSTOM_ATTRIBUTES &&
        node.type === 'tag' &&
        (0, utilities_1.isCustomComponent)(node.name, node.attribs));
}
//# sourceMappingURL=dom-to-react.js.map