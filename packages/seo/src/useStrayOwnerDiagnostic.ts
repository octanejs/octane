/**
 * Development check for the one arrangement that produces wrong metadata: two
 * OUTERMOST `<Head>` elements, neither containing the other.
 *
 * Each owns a registry and emits its own merged set, so the document ends up
 * with two `<title>` elements and the platform keeps the first. Whichever
 * component happened to render first wins, which is silent and arbitrary. The
 * fix is always the same, wrap the app in one `<Head>` so every other block
 * resolves to it.
 *
 * Reported with `console.error`, not `warn`: this is a correctness bug in the
 * page's metadata, not a style note.
 *
 * Client-only by construction. It counts in an effect, and effects never run on
 * the server, so concurrent SSR requests cannot inflate a shared counter.
 */
import { useEffect } from 'octane';

// This package publishes source, so consumers need no Node types. Bundlers
// replace the direct `process.env.NODE_ENV` read in both development and
// production browser builds. An unbundled browser host without `process`
// cannot identify its mode, so the catch below skips the diagnostic safely.
declare const process: { readonly env: { readonly NODE_ENV?: string } };

let liveOwners = 0;
let reported = false;

export function useStrayOwnerDiagnostic(owns: boolean): void {
	let checkedEnvironment = false;
	try {
		if (process.env.NODE_ENV !== 'production') {
			checkedEnvironment = true;
			useEffect(() => {
				if (!owns) return;
				liveOwners++;
				if (liveOwners > 1 && !reported) {
					reported = true;
					console.error(
						'[@octanejs/seo] Two <Head> elements are mounted with neither containing the ' +
							'other, so each emits its own merged set: the document will carry duplicate ' +
							'tags and the FIRST in document order will win, which makes the other ' +
							"component's metadata silently ineffective. Wrap the app in a single " +
							'<Head> so every other <Head> block merges into it.',
					);
				}
				return () => {
					liveOwners--;
					if (liveOwners <= 1) reported = false;
				};
			});
		}
	} catch (error) {
		// Only an unresolved environment probe may fail closed. A hook error
		// must still reach its caller, including in a development browser.
		if (checkedEnvironment || typeof process !== 'undefined') throw error;
	}
}
