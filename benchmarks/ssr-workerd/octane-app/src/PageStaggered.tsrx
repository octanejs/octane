import { StreamPage } from './StreamPage.tsrx';

// The shared streaming page on the staggered schedule (card i resolves at
// (i+1)*5ms); data promises are created at the use() sites inside StreamPage,
// so they start when the request's render begins and survive re-passes.
export default function PageStaggered() @{
	<StreamPage scenario="staggered" />
}
