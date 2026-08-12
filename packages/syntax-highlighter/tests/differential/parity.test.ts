import { afterEach, describe, expect, it } from 'vitest';
import React from 'react';
import { createRoot as createReactRoot } from 'react-dom/client';
import { flushSync as flushReact } from 'react-dom';
import { createRoot as createOctaneRoot, flushSync as flushOctane } from 'octane';
import ReactSyntaxHighlighter from 'react-syntax-highlighter';
import OctaneSyntaxHighlighter from '../../src/index.js';

const containers: HTMLElement[] = [];
afterEach(() => {
	for (const container of containers.splice(0)) container.remove();
});

function container() {
	const value = document.createElement('div');
	document.body.appendChild(value);
	containers.push(value);
	return value;
}

function serialize(node: Node): unknown {
	if (node.nodeType === Node.TEXT_NODE) return node.nodeValue;
	if (node.nodeType !== Node.ELEMENT_NODE) return null;
	const element = node as HTMLElement;
	const attributes = Object.fromEntries(
		Array.from(element.attributes)
			.map((attribute) => [attribute.name, attribute.value] as const)
			.sort(([left], [right]) => left.localeCompare(right)),
	);
	if (element.hasAttribute('style')) {
		attributes.style = Array.from(element.style)
			.sort()
			.map((property) => `${property}:${element.style.getPropertyValue(property)}`)
			.join(';');
	}
	return {
		tag: element.localName,
		attributes,
		children: Array.from(element.childNodes)
			.map(serialize)
			.filter((value) => value !== null),
	};
}

function rendered(container: HTMLElement) {
	return Array.from(container.childNodes)
		.map(serialize)
		.filter((value) => value !== null);
}

describe('differential: react-syntax-highlighter', () => {
	// @parity-case differential:render-and-update
	it('matches React DOM across line rendering, custom tags, and a language update', () => {
		const reactContainer = container();
		const octaneContainer = container();
		const reactRoot = createReactRoot(reactContainer);
		const octaneRoot = createOctaneRoot(octaneContainer);
		const initialProps = {
			language: 'javascript',
			children: 'const answer = 42;\nanswer += 1;',
			PreTag: 'section',
			CodeTag: 'samp',
			showLineNumbers: true,
			showInlineLineNumbers: true,
			wrapLines: true,
			wrapLongLines: true,
			useInlineStyles: false,
			lineProps: (line: number) => ({ 'data-line': String(line) }),
			customStyle: { width: '160px', overflowX: 'auto' },
		};

		flushReact(() => reactRoot.render(React.createElement(ReactSyntaxHighlighter, initialProps)));
		flushOctane(() => octaneRoot.render(OctaneSyntaxHighlighter, initialProps));
		expect(rendered(octaneContainer)).toEqual(rendered(reactContainer));

		const updatedProps = { ...initialProps, language: 'json', children: '{"answer":43}' };
		flushReact(() => reactRoot.render(React.createElement(ReactSyntaxHighlighter, updatedProps)));
		flushOctane(() => octaneRoot.render(OctaneSyntaxHighlighter, updatedProps));
		expect(rendered(octaneContainer)).toEqual(rendered(reactContainer));

		reactRoot.unmount();
		octaneRoot.unmount();
	});
});
