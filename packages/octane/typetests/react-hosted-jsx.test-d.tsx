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
