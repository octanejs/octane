/**
 * Typing contract for the React-hosted compat surface —
 * react-hosted-octane-compat-plan.md §3, pinned against the SHIPPED
 * `octane/react` types (checked by `pnpm typecheck`; the @ts-expect-error
 * lines fail the build if a claim stops holding):
 *
 *  1. A raw compiled Octane component type (`ComponentBody`: three required
 *     parameters, `void` return) is NOT a valid React JSX element type — the
 *     zero-cast child site requires the branded JSX-facing view.
 *  2. The exported `OctaneReactComponent<P>` facade IS accepted by React 19
 *     JSX with exact prop checking and no user cast, and intersects cleanly
 *     with `ComponentBody<P>` so one declaration serves both hosts.
 *  3. `OctaneCompat`'s `children` prop statically rejects non-element
 *     renderables, but CANNOT statically reject an ordinary React component,
 *     because every JSX expression types as `React.JSX.Element`
 *     (= `ReactElement<any, any>`). Rejection of React-only components is the
 *     runtime development validation
 *     (tests/react-hosted/octane-compat-public.test.ts).
 *  4. Child `ref` (open question 12): React 19 types `ref` as an ordinary prop
 *     for function components, so the pass-through-as-Octane-ref-prop decision
 *     types cleanly at the child site.
 */
import * as React from 'react';
import type { ComponentBody, Scope } from '../src/index.js';
import { OctaneCompat, type OctaneReactComponent } from '../src/react/index.js';

interface GreetingProps {
	name: string;
	log?: (entry: string) => void;
}

/** A compiled component as the core runtime types it today. */
declare const RawGreeting: ComponentBody<GreetingProps>;
/** The same compiled component through the shipped compat facade type. */
declare const Greeting: OctaneReactComponent<GreetingProps>;
declare const RefIsland: OctaneReactComponent<{ ref?: (element: Element | null) => void }>;

// ── 1. Raw ComponentBody is rejected by React JSX ───────────────────────────
// @ts-expect-error — (props, scope, extra) => void is not a React component type
export const rawRejected = <RawGreeting name="x" />;

// ── 2. The shipped facade is accepted with exact prop checking, no casts ────
export const accepted = (
	<OctaneCompat>
		<Greeting name="x" />
	</OctaneCompat>
);
// @ts-expect-error — wrong prop type still fails through the facade
export const wrongPropType = <Greeting name={42} />;
// @ts-expect-error — missing required prop still fails through the facade
export const missingProp = <Greeting />;
// The SAME declaration remains a valid Octane component body: the facade can
// be intersected onto compiled exports without breaking octane-side usage.
type DualView<P> = OctaneReactComponent<P> & ComponentBody<P>;
declare const DualGreeting: DualView<GreetingProps>;
export const octaneSide: ComponentBody<GreetingProps> = DualGreeting;
export const reactSide = (
	<OctaneCompat>
		<DualGreeting name="x" />
	</OctaneCompat>
);

// ── 3. children typing: elements only, but tag identity is erased ───────────
// Non-element renderables ARE statically rejected…
// @ts-expect-error — a string child is not a ReactElement
export const textChildRejected = <OctaneCompat>{'text child'}</OctaneCompat>;
// …but an ordinary React component is NOT (JSX.Element erases the tag type):
// this MUST compile, so React-only components are rejected at runtime in dev.
declare function OrdinaryReact(props: { name: string }): React.ReactNode;
export const notStaticallyRejectable = (
	<OctaneCompat>
		<OrdinaryReact name="x" />
	</OctaneCompat>
);

// ── 4. Child ref types as an ordinary prop at the child site ────────────────
export const withChildRef = (
	<OctaneCompat>
		<RefIsland ref={(element) => void element} />
	</OctaneCompat>
);

// The scope parameter stays out of the React-facing surface entirely.
export type ScopeStaysInternal = Scope;

// ── 6. component/props form: typed transport without React element typing ──
// The RAW compiled component — rejected as a JSX element type in §1 — is
// accepted DIRECTLY by the `component` prop (its extra scope/extra parameters
// absorb into the facade's `never[]` rest), and `P` infers from its own props
// parameter, so island prop mistakes are call-site type errors with zero
// per-island declarations.
export const componentForm = <OctaneCompat component={RawGreeting} props={{ name: 'x' }} />;
// The tsrx-tsc view of a `.tsrx` export — `(props) => <octane element>` — is
// equally accepted; the return type is deliberately unconstrained.
declare const TsrxGreeting: (props: GreetingProps) => { $$typeOnly: true };
export const tsrxForm = <OctaneCompat component={TsrxGreeting} props={{ name: 'x' }} />;
// @ts-expect-error — wrong prop type at the call site
export const componentFormWrong = <OctaneCompat component={RawGreeting} props={{ name: 42 }} />;
// @ts-expect-error — missing required prop
export const componentFormMissing = <OctaneCompat component={RawGreeting} props={{}} />;
// @ts-expect-error — `props` itself is required while the island has required props
export const componentFormNoProps = <OctaneCompat component={RawGreeting} />;
export const componentFormExcess = (
	// @ts-expect-error — unknown island prop
	<OctaneCompat component={RawGreeting} props={{ name: 'x', extra: 1 }} />
);
// A props-less island may omit `props` entirely.
declare const Chrome: ComponentBody<Record<string, never>>;
export const componentFormOptional = <OctaneCompat component={Chrome} />;
// The two authoring forms are mutually exclusive.
declare const greetingElement: React.ReactElement;
// @ts-expect-error — component and children cannot be combined
export const bothFormsRejected = OctaneCompat({ component: Chrome, children: greetingElement });

// ── 7. children form: the tsrx-typed island is a React JSX element type ─────
// `Octane.JSX.Element` extends `Promise<React.ReactNode>` (type-level only) —
// the ONE member of React's element-constructor return union that is NOT
// itself a `ReactNode` — so the exact signature tsrx-tsc infers for a `.tsrx`
// export is accepted by React JSX zero-cast, with exact prop checking…
import type { JSX as OctaneJSX } from '../src/jsx-runtime.js';
declare const TsrxJsxGreeting: (props: GreetingProps) => OctaneJSX.Element;
export const childrenForm = (
	<OctaneCompat>
		<TsrxJsxGreeting name="x" />
	</OctaneCompat>
);
// @ts-expect-error — wrong prop type at the child site
export const childrenFormWrong = <TsrxJsxGreeting name={42} />;
// @ts-expect-error — missing required prop at the child site
export const childrenFormMissing = <TsrxJsxGreeting />;
// …while the nominal separation survives in BOTH directions: octane ELEMENT
// values stay out of React `ReactNode` slots, and React elements do not pass
// as octane elements.
declare const octaneElementValue: OctaneJSX.Element;
// @ts-expect-error — an octane element is not a React renderable
export const octaneValueRejectedAsChild = <section>{octaneElementValue}</section>;
// @ts-expect-error — nor assignable to ReactNode
export const octaneValueRejectedAsNode: React.ReactNode = octaneElementValue;
// @ts-expect-error — a React element is not an octane element ($$kind brand)
export const reactValueRejectedAsOctane: OctaneJSX.Element = greetingElement;

// ── 5. Phase 2: real React contexts type through use()/useContext ───────────
// The core overload is STRUCTURAL (ForeignHostContext<T> — no React types in
// core); inference must recover T from a genuine React.Context<T>.
import { use, useContext } from '../src/index.js';

declare const HostTheme: React.Context<string>;
declare const HostFlags: React.Context<{ beta: boolean } | undefined>;

export const inferredTheme: string = use(HostTheme);
export const inferredThemeAlias: string = useContext(HostTheme);
export const inferredFlags: { beta: boolean } | undefined = use(HostFlags);
// @ts-expect-error — inference is real: string is not assignable to number
export const misTyped: number = use(HostTheme);
// @ts-expect-error — an arbitrary object is still rejected by the overloads
export const rejectedUsable = use({ anything: true });
