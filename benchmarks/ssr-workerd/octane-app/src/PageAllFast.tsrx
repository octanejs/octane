import { StreamPage } from './StreamPage.tsrx';

// The shared streaming page on the all-fast schedule (~1ms per card):
// per-request engine overhead dominates, so this is the throughput route.
export default function PageAllFast() @{
	<StreamPage scenario="all-fast" />
}
