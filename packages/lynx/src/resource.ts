/** Application-owned native resource reference encoded per Lynx root. */
export interface LynxNativeResource {
	readonly $$kind: 'octane.lynx.resource';
	readonly id: string | number;
}

/**
 * Create a serializable reference for a custom native element prop.
 *
 * The background driver replaces this marker with an Octane root-scoped
 * resource handle before it enters the structured-clone transport. The native
 * application remains responsible for resolving the handle ID.
 */
export function createLynxNativeResource(id: string | number): LynxNativeResource {
	if ((typeof id !== 'string' && typeof id !== 'number') || String(id).length === 0) {
		throw new TypeError('Octane Lynx native resource ID must be a non-empty string or number.');
	}
	return Object.freeze({ $$kind: 'octane.lynx.resource', id });
}

/** @internal Renderer codec predicate. */
export function isLynxNativeResource(value: unknown): value is LynxNativeResource {
	return (
		value !== null &&
		typeof value === 'object' &&
		!Array.isArray(value) &&
		(value as Partial<LynxNativeResource>).$$kind === 'octane.lynx.resource' &&
		((typeof (value as Partial<LynxNativeResource>).id === 'string' &&
			(value as Partial<LynxNativeResource>).id !== '') ||
			typeof (value as Partial<LynxNativeResource>).id === 'number')
	);
}
