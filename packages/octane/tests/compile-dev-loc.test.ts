import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';

// P1 of the hydration-mismatch feature: the compiler emits dev-only source-location
// metadata (a per-component `__s.locs` table of `{ slotIndex: [line, column] }` plus
// `__s.locFile`) used later by hydration-mismatch warnings and reusable by a future
// DevTools element→source layer. It MUST be strictly dev-gated so PRODUCTION output is
// byte-identical (zero runtime cost). These tests pin both halves of that contract.

const dev = (src: string): string => compile(src, 'App.tsrx', { dev: true }).code;
const prod = (src: string): string => compile(src, 'App.tsrx').code;

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
		const locLine = out.split('\n').find((l) => l.includes('__s.locs ='))!;
		expect(locLine).toMatch(/1: \[3, \d+\]/);
		expect(locLine).toMatch(/2: \[4, \d+\]/);
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
		const strip = (s: string) =>
			s
				.split('\n')
				.filter((l) => !l.includes('__s.locs') && !l.includes('__oct_loc'))
				.join('\n')
				.replace(/clone\((_t\$\d+), "[^"]*"\)/g, 'clone($1)');
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
		const locLine = out.split('\n').find((l) => l.includes('__s.locs ='))!;
		expect(locLine).toMatch(/\[2, \d+\]/);
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
		const locLine = out.split('\n').find((l) => l.includes('__s.locs ='))!;
		expect(locLine).toMatch(/\[3, \d+\]/);
		expect(locLine).toMatch(/\[4, \d+\]/);
	});
});
