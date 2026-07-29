import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';

// A component body is an opaque namespace destination — it can be mounted
// under HTML, SVG, or MathML — but its ROOT tag often pins the namespace
// statically: a tag that exists in exactly one namespace parses identically at
// every destination. The compiler then bakes the concrete `template()` flag
// (0 = HTML implicit, 1 = SVG, 2 = MathML) so `clone()` skips the per-clone
// destination-namespace resolution the opaque flag 3 requires. Only genuinely
// ambiguous roots (names valid in more than one namespace, custom elements,
// unknown tags, mixed fragments) may keep flag 3. These pins protect both
// directions: the hot-path win (no flag-3 templates for plain HTML component
// roots — the news-bench hydrate regression) and the correctness carve-out
// (ambiguous roots MUST keep per-destination resolution — see svg-deopt.tsrx's
// AmbiguousAnchorRoot destinations).

/** Compile a one-component module and return each template's [html, flags]. */
function templateFlags(body: string): Array<[string, string]> {
	const { code } = compile(`export function C() @{\n\t${body}\n}\n`, 'App.tsrx', {});
	const calls: Array<[string, string]> = [];
	for (const m of code.matchAll(/_\$template\(("(?:[^"\\]|\\.)*")((?:,\s*\d+)*)\)/g)) {
		calls.push([m[1], m[2].replace(/\s+/g, ' ')]);
	}
	return calls;
}

describe('component-root template namespace — static resolution', () => {
	it('an HTML-only root compiles as a plain HTML template (no namespace flag)', () => {
		expect(templateFlags('<header>x</header>')).toEqual([['"<header>x</header>"', '']]);
	});

	it('an SVG-only root compiles with the SVG flag', () => {
		expect(templateFlags('<g>x</g>')).toEqual([['"<g>x</g>"', ', 1']]);
	});

	it('a MathML-only root compiles with the MathML flag', () => {
		expect(templateFlags('<mi>x</mi>')).toEqual([['"<mi>x</mi>"', ', 2']]);
	});

	it('an all-HTML multi-root fragment compiles as an HTML frag template', () => {
		expect(templateFlags('<>\n\t\t<div>a</div>\n\t\t<span>b</span>\n\t</>')).toEqual([
			['"<div>a</div><span>b</span>"', ', 0, 1'],
		]);
	});

	it('an ambiguous root (a name SVG also defines) keeps the opaque flag', () => {
		expect(templateFlags('<a href="/">x</a>')).toEqual([['"<a href=\\"/\\">x</a>"', ', 3']]);
	});

	it('a custom-element root keeps the opaque flag', () => {
		expect(templateFlags('<x-chip>x</x-chip>')).toEqual([['"<x-chip>x</x-chip>"', ', 3']]);
	});

	it('a mixed fragment (HTML + ambiguous roots) keeps the opaque frag flags', () => {
		expect(templateFlags('<>\n\t\t<div>a</div>\n\t\t<a>b</a>\n\t</>')).toEqual([
			['"<div>a</div><a>b</a>"', ', 3, 1'],
		]);
	});
});
