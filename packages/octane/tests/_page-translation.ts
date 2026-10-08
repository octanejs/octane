/**
 * Simulates a browser page translator over text hosts. Chrome's swaps each Text
 * node for nested `<font>` wrappers holding the translation and detaches the
 * original node, which the renderer may still hold.
 */
export function translateTextHosts(root: ParentNode, selector: string): void {
	const hosts = root.querySelectorAll(selector);
	if (hosts.length === 0) throw new Error(`no text host matches ${selector}`);
	for (const host of hosts) {
		const text = host.firstChild;
		if (text === null || text.nodeType !== 3 || text.nextSibling !== null)
			throw new Error(`${selector} does not hold a single Text node`);
		const outer = document.createElement('font');
		outer.setAttribute('style', 'vertical-align: inherit;');
		const inner = document.createElement('font');
		inner.setAttribute('style', 'vertical-align: inherit;');
		inner.textContent = `[fr] ${text.nodeValue}`;
		outer.appendChild(inner);
		host.replaceChild(outer, text);
	}
}
