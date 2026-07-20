// Correctness gate: the two flavors must render the SAME application.
// Fetches every benchmark route from both production servers, strips each
// framework's own dialect (hydration comment markers, framework scripts and
// data payloads, renderer-owned attributes), and asserts the remaining
// user-visible structure — element tree, framework-agnostic attributes, and
// text — matches node for node. Run before any perf number is trusted.
import { JSDOM } from 'jsdom';
import { serveBoth } from './serve-both.mjs';

const ROUTES = ['/', '/posts', '/posts/3', '/posts/i-do-not-exist', '/deferred'];

// Attributes a framework owns (never part of the app's own contract).
const FRAMEWORK_ATTRS = /^(data-octane|data-oct-|data-tsr-|aria-busy$)/;

function signature(html) {
	const dom = new JSDOM(html);
	const { document } = dom.window;
	// Framework payloads and head plumbing are dialects, not app content.
	for (const node of document.querySelectorAll('script, style, link, template')) node.remove();
	const lines = [];
	const visit = (element, depth) => {
		// Head children are meta/title plumbing whose ORDER is a framework
		// dialect (octane emits title-first, react charset-first). Compare the
		// head as an order-insensitive set; the body stays strictly ordered.
		if (element.localName === 'head') {
			lines.push('  '.repeat(depth) + '<head>');
			const childLines = [];
			for (const child of Array.from(element.children)) {
				const saved = lines.length;
				visit(child, depth + 1);
				childLines.push(lines.splice(saved).join('\n'));
			}
			lines.push(...childLines.sort());
			return;
		}
		// Octane's Body renders the app inside a `#__app` hydration-range
		// container; react mounts directly into <body>. Transparent wrapper.
		if (element.localName === 'div' && element.id === '__app') {
			for (const child of Array.from(element.children)) visit(child, depth);
			return;
		}
		const attrs = [];
		for (const { name, value } of Array.from(element.attributes)) {
			if (FRAMEWORK_ATTRS.test(name)) continue;
			attrs.push(`${name}=${value}`);
		}
		lines.push(
			'  '.repeat(depth) +
				`<${element.localName}${attrs.length ? ' ' + attrs.sort().join(' ') : ''}>`,
		);
		let text = '';
		for (const child of Array.from(element.childNodes)) {
			if (child.nodeType === 3) text += child.textContent;
			else if (child.nodeType === 1) {
				if (text.trim())
					lines.push('  '.repeat(depth + 1) + JSON.stringify(text.replace(/\s+/g, ' ').trim()));
				text = '';
				visit(child, depth + 1);
			}
		}
		if (text.trim())
			lines.push('  '.repeat(depth + 1) + JSON.stringify(text.replace(/\s+/g, ' ').trim()));
	};
	visit(document.documentElement, 0);
	return lines.join('\n');
}

const { octane, react, stop } = await serveBoth({ BENCH_DEFER_MS: '40' });
let failures = 0;
try {
	for (const route of ROUTES) {
		const [octaneHtml, reactHtml] = await Promise.all(
			[octane, react].map((flavor) =>
				fetch(flavor.baseURL + route, { signal: AbortSignal.timeout(20_000) }).then((r) =>
					r.text(),
				),
			),
		);
		const octaneSig = signature(octaneHtml);
		const reactSig = signature(reactHtml);
		if (octaneSig === reactSig) {
			console.log(`✓ ${route} — structures match (${octaneSig.split('\n').length} nodes/lines)`);
		} else {
			failures += 1;
			console.error(`✗ ${route} — STRUCTURE MISMATCH`);
			const octaneLines = octaneSig.split('\n');
			const reactLines = reactSig.split('\n');
			for (let i = 0; i < Math.max(octaneLines.length, reactLines.length); i += 1) {
				if (octaneLines[i] !== reactLines[i]) {
					console.error(`  first divergence at line ${i}:`);
					console.error(`    octane: ${octaneLines[i] ?? '(end)'}`);
					console.error(`    react:  ${reactLines[i] ?? '(end)'}`);
					break;
				}
			}
		}
	}
} finally {
	stop();
}
if (failures > 0) {
	console.error(`${failures} route(s) diverged`);
	process.exit(1);
}
console.log('correctness gate: PASS');
