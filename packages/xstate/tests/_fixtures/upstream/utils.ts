// Adapted from @xstate/react@6.1.0 test/utils.tsx
// (statelyai/xstate @ d4f8c5b709291d44f70139a7f9ff333abd7c615c).
//
// Upstream parametrizes three of its suites over two React modes:
//
//   const reactModes = [
//     ['non-strict', React.Fragment],
//     ['strict', React.StrictMode]
//   ] as const;
//
// Octane does not implement `StrictMode` double-invoke at all
// (docs/differences-from-react.md, "Octane does not implement ... StrictMode
// double-invoke"), so the `strict` arm has nothing to run: there is no wrapper
// that would double-invoke anything, and asserting the strict render counts
// would be asserting a behavior the framework deliberately does not have. It is
// recorded as `not-applicable` in UPSTREAM.md rather than silently dropped.
//
// The `describe.each` shape and the `(%s)` name interpolation are preserved, so
// every adapted case keeps the exact full name of its upstream `non-strict`
// counterpart — which is what lets the adapted identities be compared against
// the pristine lane's.
import { describe } from 'vitest';
import * as OTL from '@octanejs/testing-library';

type SimplifiedRender = (...args: Parameters<typeof OTL.render>) => ReturnType<typeof OTL.render>;

const octaneModes = [['non-strict']] as const;

export function describeEachReactMode(
	name: string,
	fn: (suiteCase: { suiteKey: (typeof octaneModes)[number][0]; render: SimplifiedRender }) => void,
) {
	describe.each(octaneModes)(name, (suiteKey) => {
		fn({
			suiteKey,
			render: ((...args: Parameters<typeof OTL.render>) => OTL.render(...args)) as SimplifiedRender,
		});
	});
}
