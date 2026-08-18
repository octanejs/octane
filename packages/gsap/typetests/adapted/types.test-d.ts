// Adapted side: @octanejs/gsap typings compiled with tsrx-tsc.
// Shared assertion groups match ../pristine/types.test-d.ts; register/headless
// are Octane-typed extras documented in ../assertions.md.
import gsap from 'gsap';
import { useGSAP } from '@octanejs/gsap';

declare function expectType<T>(value: T): void;
declare const element: Element;
declare const elementRef: { current: Element | null };

function consumerTypeFixtures() {
	const callback = (
		context: gsap.Context,
		contextSafe: <T extends (...args: any[]) => any>(fn: T) => T,
	) => {
		expectType<gsap.Context>(context);
		expectType<() => void>(contextSafe(() => {}));
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

	// Adapted-only: runtime statics omitted from upstream .d.ts.
	expectType<true>(useGSAP.headless);
	useGSAP.register(gsap);

	// 6. Non-function callback is rejected.
	// @ts-expect-error callbacks must be functions.
	useGSAP(42);
	// 7. Non-ref/non-element/non-string scope is rejected.
	// @ts-expect-error scope must resolve to a selector, element, or ref-like object.
	useGSAP({ scope: 42 });
}

void consumerTypeFixtures;
