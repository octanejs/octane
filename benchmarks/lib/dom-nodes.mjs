// Deterministic DOM-shape instrumentation shared by the browser benchmarks.
// Pass this function directly to Playwright's page.evaluate: it is deliberately
// self-contained because the browser receives only the serialized function.
export function censusDomNodes(rootSelector = '#main') {
	const root =
		rootSelector === 'body'
			? document.body
			: document.querySelector(rootSelector) ||
				(rootSelector === '#main' ? document.querySelector('#app') : null);
	if (root === null) throw new Error(`DOM census root not found: ${rootSelector}`);

	let total = 0;
	let elements = 0;
	let text = 0;
	let comments = 0;
	let emptyText = 0;
	let whitespaceText = 0;
	const commentsByData = Object.create(null);
	const commentParents = Object.create(null);
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_ALL);
	while (walker.nextNode()) {
		const node = walker.currentNode;
		total++;
		if (node.nodeType === Node.ELEMENT_NODE) {
			elements++;
		} else if (node.nodeType === Node.TEXT_NODE) {
			text++;
			const value = node.nodeValue || '';
			if (value.length === 0) emptyText++;
			else if (value.trim().length === 0) whitespaceText++;
		} else if (node.nodeType === Node.COMMENT_NODE) {
			comments++;
			const data = node.nodeValue || '';
			commentsByData[data] = (commentsByData[data] || 0) + 1;
			const parent = node.parentElement;
			const parentKey =
				parent === null
					? '(non-element)'
					: parent.localName +
						(parent.id ? '#' + parent.id : '') +
						(parent.classList.length ? '.' + [...parent.classList].join('.') : '');
			commentParents[parentKey] = (commentParents[parentKey] || 0) + 1;
		}
	}

	const sortedEntries = (record) =>
		Object.fromEntries(
			Object.entries(record).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
		);
	return {
		root: root === document.body ? 'body' : root.id ? '#' + root.id : rootSelector,
		total,
		elements,
		text,
		comments,
		emptyText,
		whitespaceText,
		commentsByData: sortedEntries(commentsByData),
		commentParents: sortedEntries(commentParents),
	};
}

export function deterministicCount(value) {
	return { median: value, min: value, samples: [value] };
}
