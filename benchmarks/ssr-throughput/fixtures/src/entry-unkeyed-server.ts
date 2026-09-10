import { prerender } from 'octane/static';
import { UnkeyedDescriptorPage } from './deopt-unkeyed';

// Separate entry: the regular SSR throughput bundle and fixture remain intact.
export async function renderUnkeyedDescriptors() {
	return prerender(UnkeyedDescriptorPage as any);
}
