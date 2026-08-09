// Pristine side: published @gsap/react 2.1.2 typings, compiled with plain tsc.
// Assertion groups are listed in ../assertions.md and must stay one-for-one
// with ../adapted/types.test-d.ts for the shared surface.
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

declare function expectType<T>(value: T): void;
declare const element: Element;
declare const elementRef: { current: Element | null };

function consumerTypeFixtures() {
	const callback = (
		context: gsap.Context,
		contextSafe?: <T extends (...args: any[]) => any>(fn: T) => T,
	) => {
		expectType<gsap.Context>(context);
		if (contextSafe) {
			expectType<() => void>(contextSafe(() => {}));
		}
	};

	// 1. Callback form returns a context.
	expectType<gsap.Context>(useGSAP(callback).context);
	// 2. Positional dependency array is accepted.
	expectType<gsap.Context>(useGSAP(callback, []).context);
	// 3. Config with scope element and empty dependencies is accepted.
	expectType<gsap.Context>(useGSAP(callback, { dependencies: [], scope: element }).context);
	// 4. Config-only call with ref-like scope and revertOnUpdate is accepted.
	expectType<gsap.Context>(useGSAP({ scope: elementRef, revertOnUpdate: true }).context);
	// 5. String scope selector is accepted.
	expectType<gsap.Context>(useGSAP({ scope: '.scope' }).context);

	// 6. Non-function callback is rejected.
	// @ts-expect-error callbacks must be functions.
	useGSAP(42);
	// 7. Non-ref/non-element/non-string scope is rejected.
	// @ts-expect-error scope must resolve to a selector, element, or ref-like object.
	useGSAP({ scope: 42 });
}

void consumerTypeFixtures;
void gsap;
