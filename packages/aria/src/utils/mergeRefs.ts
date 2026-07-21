// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/utils/mergeRefs.ts).
// React's `Ref` type becomes a local structural type — octane refs are the same shapes
// (callback ref with optional cleanup, or object ref), passed as ordinary props.

export type MergableRef<T> =
	((value: T | null) => void | (() => void)) | { current: T | null } | null | undefined;

/**
 * Merges multiple refs into one. Works with either callback or object refs.
 */
export function mergeRefs<T>(...refs: Array<MergableRef<T>>): MergableRef<T> {
	if (refs.length === 1 && refs[0]) {
		return refs[0];
	}

	return (value: T | null) => {
		let hasCleanup = false;

		const cleanups = refs.map((ref) => {
			const cleanup = setRef(ref, value);
			hasCleanup ||= typeof cleanup == 'function';
			return cleanup;
		});

		if (hasCleanup) {
			return () => {
				cleanups.forEach((cleanup, i) => {
					if (typeof cleanup === 'function') {
						cleanup();
					} else {
						setRef(refs[i], null);
					}
				});
			};
		}
	};
}

function setRef<T>(ref: MergableRef<T>, value: T | null): void | (() => void) {
	if (typeof ref === 'function') {
		return ref(value);
	} else if (ref != null) {
		ref.current = value;
	}
}
