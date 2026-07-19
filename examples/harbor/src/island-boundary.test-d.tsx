/**
 * Type-level pins for the island boundary (checked by `pnpm typecheck`, never
 * executed or bundled): the .tsrx islands join the program with real octane
 * types, BOTH OctaneCompat authoring forms type-check zero-cast, and a prop
 * mistake at either call site is a TYPE ERROR. If a `@ts-expect-error` line
 * stops erroring, the boundary has silently loosened and this file fails the
 * build.
 */
import type * as React from 'react';
import { OctaneCompat } from 'octane/react';
import { FEATURED_PLAN } from './data/plans.ts';
import { PriceBadge } from './islands/PriceBadge.tsrx';
import { PlanConfigurator, type CompareEntry } from './islands/PlanConfigurator.tsrx';
import { Recommendations } from './islands/Recommendations.tsrx';

// The octane-typed island export is accepted directly — zero casts, no shims.
export const wellTyped = <OctaneCompat component={PriceBadge} props={{ pricePerSeat: 48 }} />;

// @ts-expect-error — wrong prop TYPE at the island call site
export const wrongPropType = <OctaneCompat component={PriceBadge} props={{ pricePerSeat: '48' }} />;
// @ts-expect-error — missing required island prop
export const missingProp = <OctaneCompat component={PriceBadge} props={{}} />;
// @ts-expect-error — the island requires props, so `props` cannot be omitted
export const missingProps = <OctaneCompat component={PriceBadge} />;
export const unknownProp = (
	// @ts-expect-error — unknown island prop
	<OctaneCompat component={PriceBadge} props={{ pricePerSeat: 48, x: 1 }} />
);

// The children form is equally typed and zero-cast: the octane-typed island
// is a valid React JSX element type (octane's element type satisfies the
// `Promise<ReactNode>` arm of React's element-constructor union), with the
// SAME exact prop checking at the child site.
export const childrenForm = (
	<OctaneCompat>
		<PriceBadge pricePerSeat={48} />
	</OctaneCompat>
);
// @ts-expect-error — wrong prop TYPE at the child site
export const childrenFormWrong = <PriceBadge pricePerSeat="48" />;
// @ts-expect-error — missing required prop at the child site
export const childrenFormMissing = <PriceBadge />;

// The nominal separation survives: an octane ELEMENT VALUE is still not a
// React renderable — only the component/element TRANSPORT crosses.
declare const octaneElementValue: ReturnType<typeof PriceBadge>;
// @ts-expect-error — octane elements stay out of arbitrary ReactNode slots
export const protectedSlot = <div>{octaneElementValue}</div>;
// @ts-expect-error — and out of ReactNode annotations
export const protectedAnnotation: React.ReactNode = octaneElementValue;

// The `Promise<ReactNode>` parent that opens the tag gate is CONSUMPTION-
// poisoned (jsx-runtime.d.ts): an island element cannot be awaited or used as
// a thenable — those are hard type errors, not silent runtime no-ops.
export async function elementAwaitRejected() {
	// @ts-expect-error — TS1320: an octane element is not a valid promise
	await octaneElementValue;
}
// @ts-expect-error — .then with a callback fails overload resolution
export const elementThenRejected = octaneElementValue.then(() => null);

// Callback payloads flow typed out of the island: `entry` infers CompareEntry.
export const callbackTyped = (
	<OctaneCompat
		component={PlanConfigurator}
		props={{
			plan: FEATURED_PLAN,
			onAddToCompare: (entry) => {
				const seats: number = entry.seats;
				const id: string = entry.planId;
				void seats;
				void id;
			},
		}}
	/>
);
const mistypedHandler = (entry: { wrong: true }) => void entry;
export const callbackMistyped = (
	<OctaneCompat
		component={PlanConfigurator}
		// @ts-expect-error — callback parameter shape is checked, not any
		props={{ plan: FEATURED_PLAN, onAddToCompare: mistypedHandler }}
	/>
);

export const faultRequired = (
	// @ts-expect-error — a nullable island prop is still required to be PASSED
	<OctaneCompat component={Recommendations} props={{ plan: FEATURED_PLAN }} />
);

export type Entry = CompareEntry;
