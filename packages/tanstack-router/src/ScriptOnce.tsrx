'use strong';

// The browser build has no scroll-script source. Preserve the server-owned
// range without reconciling its content, then remove it after hydration commits.
// A client-only mount has no server range and renders nothing.
import { isServer } from '@tanstack/router-core/isServer';
import { Hydrate, trustHTML } from 'octane';
import { never } from 'octane/hydration';
import { useRouter } from './context';
import { useHydrated } from './ClientOnly.tsrx';

export function ScriptOnce(props: { children: string }) @{
	const router = useRouter();
	const hydrated = useHydrated();

	@if ((isServer ?? router.isServer) || !hydrated) {
		<Hydrate split={false} when={never()}>
			<script
				nonce={router.options.ssr?.nonce}
				dangerouslySetInnerHTML={trustHTML(props.children)}
			/>
		</Hydrate>
	} @else {
		<></>
	}
}
