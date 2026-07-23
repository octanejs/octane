import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';

// P1 of the hydration-mismatch feature: the compiler emits dev-only source-location
// metadata (a per-component `__s.locs` table of `{ slotIndex: [line, column] }` plus
// `__s.locFile`) used later by hydration-mismatch warnings and reusable by a future
// DevTools element→source layer. It MUST be strictly dev-gated so PRODUCTION output is
// byte-identical (zero runtime cost). These tests pin both halves of that contract.

const dev = (src: string): string => compile(src, 'App.tsrx', { dev: true, autoMemo: false }).code;
const prod = (src: string): string => compile(src, 'App.tsrx', { autoMemo: false }).code;

// The `__s.locs = { … }` table, independent of statement layout: everything
// between the assignment and its closing `};`.
const locsTableOf = (out: string): string => {
	const start = out.indexOf('__s.locs = ');
	expect(start).toBeGreaterThan(-1);
	const end = out.indexOf(';', start);
	return out.slice(start, end);
};

describe('dev hydration source-LOC plumbing (P1)', () => {
	const WITH_CONSTRUCTS = `export function App(props) @{
  <div>
    @if (props.show) { <span>{("a")}</span> }
    @for (const x of props.xs; key x.id) { <li>{x.name as string}</li> }
  </div>
}`;

	it('emits a structured __s.locs table + __s.locFile in dev', () => {
		const out = dev(WITH_CONSTRUCTS);
		expect(out).toContain('__s.locs =');
		expect(out).toContain('__s.locFile = "App.tsrx"');
		// @if is the first construct (slot 1, line 3), @for the second (slot 2, line 4).
		const locTable = locsTableOf(out);
		expect(locTable).toMatch(/1: \[3, \d+\]/);
		expect(locTable).toMatch(/2: \[4, \d+\]/);
		// Set once per scope instance, before any slot calls.
		expect(out).toContain('if (__s.locs === undefined)');
	});

	it('emits NOTHING in production (byte-identical to pre-feature output)', () => {
		const out = prod(WITH_CONSTRUCTS);
		expect(out).not.toContain('__s.locs');
		expect(out).not.toContain('__s.locFile');
		expect(out).not.toContain('__oct_loc');
	});

	it('prod output == dev output with the dev-only LOC artifacts removed', () => {
		// The ONLY differences dev introduces are: the `__s.locs`/`__s.locFile` table, the
		// per-element `__oct_loc` stamps, and the `clone(tpl, "loc")` structural-mismatch loc
		// argument — all strictly dev-gated. Normalize them away and the two outputs must be
		// byte-identical (proving production carries zero LOC overhead).
		// Strip is statement-shaped, not line-shaped: the locs stash prints as one
		// (possibly multi-line) `if (__s.locs === undefined) { … }` statement, and
		// statement presence can shift the printer's blank-line placement — so
		// blank lines are normalized away on both sides too.
		const strip = (s: string) => {
			// The binding-level `__oct_loc` stamps are try/catch STATEMENTS whose
			// layout is printer-defined — remove them statement-shaped, not
			// line-shaped, so the strip is insensitive to one-line vs multi-line
			// printing of the same guarded assignment.
			const withoutLocStamps = s.replace(
				/try\s*\{[^{}]*__oct_loc[^{}]*\}\s*catch\s*\{[^{}]*\}/g,
				'',
			);
			const lines = withoutLocStamps.split('\n');
			const kept: string[] = [];
			let skippingDepth = 0;
			for (const l of lines) {
				if (skippingDepth > 0) {
					skippingDepth += (l.match(/\{/g) || []).length - (l.match(/\}/g) || []).length;
					continue;
				}
				if (l.includes('if (__s.locs === undefined)')) {
					skippingDepth = (l.match(/\{/g) || []).length - (l.match(/\}/g) || []).length;
					continue;
				}
				if (l.includes('__s.locs') || l.includes('__oct_loc')) continue;
				if (l.trim() === '') continue;
				kept.push(l);
			}
			return kept.join('\n').replace(/clone\((_t\$\d+), "[^"]*"\)/g, 'clone($1)');
		};
		expect(strip(prod(WITH_CONSTRUCTS))).toBe(strip(dev(WITH_CONSTRUCTS)));
	});

	it('omits the table entirely for a component with no located constructs', () => {
		// A pure static template has no if/for/switch/try/component/child constructs →
		// nothing to attribute → no dev emission even in dev (keeps output lean).
		const out = dev(`export function App() @{ <div class="x">hi</div> }`);
		expect(out).not.toContain('__s.locs');
	});

	it('preserves the original expression loc through .tsx fragment extraction', () => {
		// A `.tsx` host element with a dynamic child is extracted into a synthetic fragment
		// sub-component; the child is threaded as a `props.hN` hole. The hole node MUST carry
		// the ORIGINAL `{expr}` position (memberProps copies `.loc`) — otherwise the dev LOC
		// would silently degrade to the host element's position. Regression for that drop.
		const out = dev(`export function C(props) {
  return <span id="c">{props.n}</span>;
}`);
		// The childTextHole construct's slot LOC must point at the `{props.n}` hole (line 2),
		// not be absent.
		expect(out).toContain('__s.locs =');
		expect(locsTableOf(out)).toMatch(/\[2, \d+\]/);
	});

	it('attributes component + child-hole constructs too', () => {
		const out = dev(`export function App(props) @{
  <div>
    <Child a={props.a} />
    {props.node}
  </div>
}`);
		expect(out).toContain('__s.locs =');
		// Child component (line 3) + renderable child hole (line 4) each get a slot LOC.
		const locTable = locsTableOf(out);
		expect(locTable).toMatch(/\[3, \d+\]/);
		expect(locTable).toMatch(/\[4, \d+\]/);
	});

	it('preserves anonymous default-export function identity while embedding root LOC', () => {
		const arrow = dev('export default () => null;');
		expect(arrow).toMatch(/export default \(\) => \{/);
		expect(arrow).toContain('__octane_loc:');
		expect(arrow).not.toContain('__component');

		const declaration = dev('export default function() { return null; }');
		expect(declaration).toMatch(/export default function\s*\(\)\s*\{/);
		expect(declaration).toContain('__octane_loc:');
		expect(declaration).not.toContain('export default (');
	});
});
