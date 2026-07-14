import { Trie } from '@wry/trie';
import { FragmentReference } from './FragmentReference.js';
import { InternalQueryReference } from './QueryReference.js';
export class SuspenseCache {
	queryRefs = new Trie();
	fragmentRefs = new Trie();
	options;
	constructor(options = {}) {
		this.options = options;
	}
	getQueryRef(cacheKey, createObservable) {
		const ref = this.queryRefs.lookupArray(cacheKey);
		if (!ref.current) {
			ref.current = new InternalQueryReference(createObservable(), {
				autoDisposeTimeoutMs: this.options.autoDisposeTimeoutMs,
				onDispose: () => {
					delete ref.current;
				},
			});
		}
		return ref.current;
	}
	getFragmentRef(cacheKey, client, options) {
		const ref = this.fragmentRefs.lookupArray(cacheKey);
		if (!ref.current) {
			ref.current = new FragmentReference(client, options, {
				autoDisposeTimeoutMs: this.options.autoDisposeTimeoutMs,
				onDispose: () => {
					delete ref.current;
				},
			});
		}
		return ref.current;
	}
	add(cacheKey, queryRef) {
		const ref = this.queryRefs.lookupArray(cacheKey);
		ref.current = queryRef;
	}
}
