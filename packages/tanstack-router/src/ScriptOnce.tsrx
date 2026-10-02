// ScriptOnce — port of react-router's ScriptOnce.tsx. The server emits the
// script; upstream's client renders null because the script removes itself
// (`document.currentScript.remove()`) before React hydrates. Octane hydration
// claims the server's structure instead, so the hydration render adopts the
// server `<script>` without comparing its content (the client never runs it, and
// may not have it) and the post-hydration render drops it. A client-only mount
// renders nothing, as upstream does.
import { isServer } from '@tanstack/router-core/isServer';
import { useRouter } from './context.ts';
import { useHydrated } from './ClientOnly.tsrx';

export function ScriptOnce(props: { children: string }) @{
	const router = useRouter();
	const hydrated = useHydrated();

	@if ((isServer ?? router.isServer) || !hydrated) {
		<script
			nonce={router.options.ssr?.nonce}
			suppressHydrationWarning
			dangerouslySetInnerHTML={{
				__html: props.children,
			}}
		/>
	} @else {
		<></>
	}
}
