// Port of react-router's scroll-restoration.tsx. router-core's server build of
// `getScrollRestorationScriptForRouter` returns the inline restore script unless
// a `scrollRestoration` function declines the location; its client build always
// returns null. Upstream's client renders null because its ScriptOnce removes
// itself before React hydrates. Octane hydration claims the server's arm, so the
// client takes the arm the server took and ScriptOnce adopts, then drops, the
// server's script.
import { getScrollRestorationScriptForRouter } from '@tanstack/router-core/scroll-restoration-script';
import type { AnyRouter } from '@tanstack/router-core';
import { useRouter } from './context.ts';
import { ScriptOnce } from './ScriptOnce.tsrx';

function rendersScript(router: AnyRouter): boolean {
	const option = router.options.scrollRestoration;
	return typeof option !== 'function' || option({ location: router.latestLocation });
}

export function ScrollRestorationScript() @{
	const router = useRouter();
	const script = getScrollRestorationScriptForRouter(router);

	@if (script !== null || rendersScript(router)) {
		<ScriptOnce children={script ?? ''} />
	} @else {
		<></>
	}
}
