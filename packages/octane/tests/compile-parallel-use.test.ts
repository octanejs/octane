import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';

// Compiler-emit shape of the parallel-`use()` pipeline
// (docs/suspense-parallel-use-plan.md): Pass A memoizes creations, Pass B
// hoists them into __pu$ temps + emits _$useBatch, the warm plan emits
// Comp.__warm and the in-body warm thunk. The pipeline is ON BY DEFAULT;
// `parallelUse: false` opts out and restores the pre-feature output (no
// pipeline artifacts, `use()` untouched).

const off = (src: string): string => compile(src, 'App.tsrx', { parallelUse: false }).code;
const on = (src: string): string => compile(src, 'App.tsrx').code;

const TWO_USES = `import { use } from 'octane';
export function App(props) @{
  <>
    @try {
      const a = use(props.startA());
      const b = use(props.startB());
      <div class="both">{a + '/' + b as string}</div>
    } @pending {
      <div class="fallback">{'loading'}</div>
    }
  </>
}`;

const DEPENDENT = `import { use } from 'octane';
export function App(props) @{
  <>
    @try {
      const a = use(fetchA(props.id));
      const b = use(fetchB(props.id));
      const c = use(fetchC(a.ref));
      <div>{a + b + c as string}</div>
    } @pending { <p>{'w'}</p> }
  </>
}`;

const RECURSIVE = `import { use } from 'octane';
import { fetchData, LEVELS } from './data.js';
export function Level({ level, version }) @{
	const data = use(fetchData(level, version));
	<div class="level">
		<span>{data as string}</span>
		@if (level < LEVELS - 1) {
			<Level level={level + 1} version={version} />
		}
	</div>
}`;

const IN_LOOP = `import { use } from 'octane';
export function App(props) @{
  const out = [];
  for (const p of props.promises) {
    out.push(use(p));
  }
  <div>{out.join(',') as string}</div>
}`;

describe('parallelUse — opt-out is inert', () => {
	it('parallelUse: false emits no pipeline artifacts and leaves use() untouched', () => {
		const code = off(TWO_USES);
		expect(code).not.toContain('_$useBatch');
		expect(code).not.toContain('_$useMemo');
		expect(code).not.toContain('__warm');
		expect(code).not.toContain('__pu$');
		expect(code).toContain('use(props.startA())');
	});

	it('the pipeline is the DEFAULT: omitted and explicit-true agree byte-for-byte', () => {
		expect(compile(TWO_USES, 'App.tsrx', { parallelUse: true }).code).toBe(on(TWO_USES));
		expect(on(TWO_USES)).toContain('_$useBatch');
	});
});

describe('parallelUse — emit shape', () => {
	it('memoizes creations with member-path deps, hoists, and batches', () => {
		const code = on(TWO_USES);
		// Pass A: slot-keyed memoized creations with member-path deps.
		expect(code).toMatch(/_\$useMemo\(\(\) => props\.startA\(\), \[props\.startA\], _h\$\d+\)/);
		expect(code).toMatch(/_\$useMemo\(\(\) => props\.startB\(\), \[props\.startB\], _h\$\d+\)/);
		// Pass B: both creations hoisted above the batch, unwraps read temps.
		expect(code).toMatch(/_\$useBatch\(\[__pu\$\d+, __pu\$\d+\]\)/);
		expect(code).toMatch(/const a = use\(__pu\$\d+\)/);
		expect(code).toMatch(/const b = use\(__pu\$\d+\)/);
		// Creation order precedes the batch, which precedes the first unwrap
		// (`_$useBatch(` with the paren — the bare name also appears in the
		// import line).
		const batchAt = code.indexOf('_$useBatch(');
		expect(code.indexOf('_$useMemo(() => props.startA()')).toBeLessThan(batchAt);
		expect(code.indexOf('_$useMemo(() => props.startB()')).toBeLessThan(batchAt);
		expect(batchAt).toBeLessThan(code.indexOf('const a = use('));
	});

	it('a data-dependent creation breaks the run into strata', () => {
		const code = on(DEPENDENT);
		// First stratum: a + b batched together; c (depends on `a`) forms its
		// own later stratum after the unwraps.
		expect(code).toMatch(/_\$useBatch\(\[__pu\$\d+, __pu\$\d+\]\)/);
		expect(code).toMatch(/_\$useBatch\(\[__pu\$\d+\]\)/);
		expect(code).toMatch(/_\$useMemo\(\(\) => fetchC\(a\.ref\), \[fetchC, a\.ref\], _h\$\d+\)/);
		const firstBatch = code.indexOf('_$useBatch');
		expect(firstBatch).toBeLessThan(code.indexOf('const a = use('));
		expect(code.indexOf('fetchC')).toBeGreaterThan(code.indexOf('const b = use('));
	});

	it('emits a recursive __warm plan and a guarded warm thunk', () => {
		const code = on(RECURSIVE);
		// The component's fetch plan, Object.assign-attached to the inner
		// function: own creation + guarded child recursion.
		expect(code).toMatch(/Object\.assign\(function Level\(/);
		expect(code).toContain('__warm: (__wp) =>');
		expect(code).toMatch(/_\$warmMemo\(\(\) => fetchData\(level, version\)/);
		expect(code).toMatch(/if \(level < LEVELS - 1\) _\$warmChild\(Level, \{/);
		// The in-body batch carries the child warm thunk.
		expect(code).toMatch(/_\$useBatch\(\[__pu\$\d+\], \(\) => \{/);
	});

	it('never touches use() inside loops (shared slot symbols)', () => {
		const code = on(IN_LOOP);
		expect(code).toContain('out.push(use(p))');
		expect(code).not.toContain('_$useMemo');
	});

	it('JSX-valued props exclude a child from the warm plan', () => {
		const code = on(`import { use } from 'octane';
function Slot(props) @{ <div>{props.label as string}</div> }
export function App(props) @{
  <>
    @try {
      const v = use(props.p);
      <Slot label={v as string} el={<b>{'x'}</b>} />
    } @pending { <p>{'w'}</p> }
  </>
}`);
		expect(code).not.toContain('__warm');
		expect(code).not.toContain('_$warmChild');
	});
});
