import {
	getScrollRestorationScriptForRouter,
} from '@tanstack/router-core/scroll-restoration-script';
import { isServer } from '@tanstack/router-core/isServer';
import { useRouter } from './context.ts';
import { ScriptOnce } from './ScriptOnce.tsrx';

export function ScrollRestorationScript() @{
	const router = useRouter();
	const script = getScrollRestorationScriptForRouter(router);
	// The core intentionally omits the script body from browser bundles. Keep
	// the same branch while adopting SSR, then ScriptOnce removes the script.
	const enabled =
		isServer ?? router.isServer
			? script !== null
			: typeof router.options.scrollRestoration !== 'function' ||
				router.options.scrollRestoration({ location: router.latestLocation });

	@if (enabled) {
		<ScriptOnce children={script ?? ''} />
	} @else {
		<></>
	}
}
