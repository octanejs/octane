/**
 * Register one component instance's descriptors with the enclosing registry.
 *
 * Registration happens DURING RENDER, not in an effect: effects never run on the
 * server, so an effect-based registration would leave the server-rendered
 * `<head>` empty and hand crawlers nothing. That is precisely the failure this
 * package exists to remove.
 *
 * A layout effect confirms the render's writes once it commits; the registry
 * reverts writes from a render that never committed (a caught one) at the next
 * flush. The passive effects notify the outlet and remove the source on
 * unmount. Document metadata does not affect layout, so it does not block paint.
 */
import { useContext, useEffect, useLayoutEffect, useRef } from 'octane';
import { SeoContext } from './context.js';
import type { SeoConfig, SeoDescriptor } from './descriptors.js';
import { commitSeoSource } from './registry.js';

export function useRegisterSeo(descriptors: readonly SeoDescriptor[], config?: SeoConfig): void {
	const registry = useContext(SeoContext);
	if (registry === null) {
		throw new Error(
			'[@octanejs/seo] <Title>/<Meta>/<Link>/<Script>/<JsonLd>/<Seo> must render inside a <Head>.',
		);
	}
	const idRef = useRef<number>(0);
	if (idRef.current === 0) idRef.current = registry.nextSourceId();
	registry.register(idRef.current, descriptors);
	if (config !== undefined) registry.configure(idRef.current, config);

	// Runs before any passive flush in the same commit, so only writes from
	// uncommitted renders are left pending when the registry flushes.
	useLayoutEffect(() => commitSeoSource(registry, idRef.current), null);

	// Two passive effects, and they must stay separate.
	//
	// Publish re-registers the committed descriptors and notifies the outlet. The
	// dependency array is left to the compiler on purpose: `descriptors` is read
	// here, so inference keys the effect on it and re-runs exactly when the
	// metadata this component contributes may have changed. Both calls are
	// idempotent, re-registering an equal set is a no-op and `flush()` does
	// nothing unless something actually changed.
	useEffect(() => {
		registry.register(idRef.current, descriptors);
		if (config !== undefined) registry.configure(idRef.current, config);
		commitSeoSource(registry, idRef.current);
		registry.flush();
	});

	// Teardown is mount/unmount ONLY. It cannot ride the effect above: that one
	// re-runs, and a cleanup running before each re-run would make a component
	// delete its own registration merely by re-rendering, letting an outer
	// default win. This closure reads nothing that changes, so inference gives it
	// mount/unmount semantics on its own.
	useEffect(() => {
		return () => {
			registry.remove(idRef.current);
			registry.flush();
		};
	});
}
