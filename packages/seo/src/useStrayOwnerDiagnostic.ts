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

// This package publishes source, so a browser application compiles the file
// below with its own tsconfig and runs it in a host that has neither
// `@types/node` nor a `process` global. The reference is therefore declared
// here and guarded at runtime; without the guard every `<Head>` render throws a
// ReferenceError in any host that does not define one.
//
// The read stays spelled out as `process.env.NODE_ENV` because that is the
// expression bundlers substitute with a literal. Where the identifier also
// survives, Node and SSR, the production branch is exact. Where only the value
// is substituted the guard reads false and the diagnostic behaves as it does in
// development: one counter and one effect per owning `<Head>`, which is the
// price of not throwing.
declare const process: { readonly env: { readonly NODE_ENV?: string } } | undefined;

let liveOwners = 0;
let reported = false;

export function useStrayOwnerDiagnostic(owns: boolean): void {
	if (typeof process !== 'undefined' && process.env.NODE_ENV === 'production') return;
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
