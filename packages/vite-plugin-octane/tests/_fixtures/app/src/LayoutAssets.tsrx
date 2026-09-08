import { Hydrate, type OctaneNode } from 'octane';
import { interaction } from 'octane/hydration';
import { LayoutDeferredHydrationProof } from './layout-deferred-hydration.tsrx';

export default function LayoutAssets(props: { children: OctaneNode }) @{
	<section class="layout-assets">
		<Hydrate when={interaction()}>
			<LayoutDeferredHydrationProof />
		</Hydrate>
		{props.children}
	</section>
}
