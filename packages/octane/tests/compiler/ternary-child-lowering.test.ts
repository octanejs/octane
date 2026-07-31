import { describe, it, expect } from 'vitest';
import { compile } from 'octane/compiler';

// Lowering contract for `{cond ? A : B}` at a JSX child position when exactly
// one arm is a JSX literal. Two published properties:
//   1. The ternary still lowers to the ifBlock machinery (each branch mounts
//      real DOM) rather than de-opting the whole hole — a mixed arm must not
//      silently change the JSX arm's mount strategy.
//   2. The non-JSX arm's VALUE is routed into the branch's render output (the
//      renderable-hole family), never discarded as a bare setup statement —
//      and a `null` arm in either position compiles (a null consequent used
//      to throw inside the compiler).
// Runtime/differential/hydration suites assert the rendered behavior; these
// pin the classification the same way known-string-holes.test.ts does.

function importsOf(source: string, mode: 'client' | 'server'): Set<string> {
	const { code } = compile(source, 'ternary-child-lowering.tsrx', { hmr: false, mode });
	const match = code.match(/import\s*\{([^}]*)\}\s*from\s*['"]octane(?:\/server)?['"]/);
	return new Set(
		(match?.[1] ?? '')
			.split(',')
			.map((part) => part.trim().split(/\s+as\s+/)[0])
			.filter(Boolean),
	);
}

function octaneImports(source: string): Set<string> {
	return importsOf(source, 'client');
}

describe('ternary child holes with one JSX arm — lowering contract', () => {
	it('keeps the ifBlock claim and routes the value arm through a renderable hole', () => {
		const imports = octaneImports(`
			export function T(props) @{
				<div id="host">{props.on ? <b>{'yes'}</b> : props.label}</div>
			}
		`);
		expect(imports).toContain('ifBlock');
		// The non-JSX arm renders through the renderable-hole family (whichever
		// member the body shape selects), so its value cannot be dropped.
		const holeFamily = ['textHole', 'childTextHole', 'textSlot', 'childSlot'];
		expect(holeFamily.some((name) => imports.has(name))).toBe(true);
	});

	it('a `null` consequent compiles to an ifBlock with an empty then branch', () => {
		const imports = octaneImports(`
			export function T(props) @{
				<div id="host">{props.on ? null : <b>{'no'}</b>}</div>
			}
		`);
		expect(imports).toContain('ifBlock');
	});

	it('the server claims template-form ternary holes like an authored @if', () => {
		const imports = importsOf(
			`
			export function T(props) @{
				<div id="host">{props.on ? <b>{'yes'}</b> : props.label}</div>
			}
		`,
			'server',
		);
		// Symmetric with the client's ifBlock claim: the arm ranges must match
		// what the hydrating client adopts.
		expect(imports).toContain('ssrControl');
		expect(imports).toContain('ssrArm');
	});

	it('value positions keep the value lowering on BOTH sides', () => {
		// The claim exists only where the client claims: a hole that is the
		// direct child of a host element in a template walk. Everywhere else —
		// children-as-props roots, returned `.tsx` trees, body/fragment roots —
		// the hole is a value, and the server must keep ssrChild for the same
		// holes or the hydration shapes diverge.
		const childrenRootSrc = `
			function Box(props) @{ <section>{props.children}</section> }
			export function T(props) @{
				<div><Box>{props.on ? <b>{'yes'}</b> : 'nope'}</Box></div>
			}
		`;
		expect(octaneImports(childrenRootSrc)).not.toContain('ifBlock');
		expect(importsOf(childrenRootSrc, 'server')).not.toContain('ssrControl');

		const returnedSrc = `
			export function T(props) {
				return <div>{props.on ? <b>{'yes'}</b> : 'nope'}</div>;
			}
		`;
		expect(octaneImports(returnedSrc)).not.toContain('ifBlock');
		expect(importsOf(returnedSrc, 'server')).not.toContain('ssrControl');

		const rootFragmentSrc = `
			export function T(props) @{
				<>
					<button>{'flip'}</button>
					{props.on ? <b>{'yes'}</b> : 'nope'}
				</>
			}
		`;
		expect(octaneImports(rootFragmentSrc)).not.toContain('ifBlock');
		expect(importsOf(rootFragmentSrc, 'server')).not.toContain('ssrControl');
	});

	it('a host-wrapped hole inside component children claims on BOTH sides', () => {
		// Only the children ROOT is the children-as-props value; template
		// content nested in a host element inside children claims like any
		// other template child.
		const src = `
			function Box(props) @{ <section>{props.children}</section> }
			export function T(props) @{
				<div><Box><p>{props.on ? <b>{'yes'}</b> : 'nope'}</p></Box></div>
			}
		`;
		expect(octaneImports(src)).toContain('ifBlock');
		expect(importsOf(src, 'server')).toContain('ssrControl');
	});
});
