/**
 * Three attachment path handling.
 *
 * Adapted from React Three Fiber v9.6.1's string attachment and automatic
 * geometry/material behavior:
 * https://github.com/pmndrs/react-three-fiber/blob/2a528745e9aa7c9e6cca41e404b59d45cf0d0cc7/packages/fiber/src/core/utils.tsx#L286-L319
 * https://github.com/pmndrs/react-three-fiber/blob/2a528745e9aa7c9e6cca41e404b59d45cf0d0cc7/packages/fiber/src/core/utils.tsx#L525-L529
 *
 * Function attachments use Octane's post-accept local-callback channel, so
 * this module intentionally owns string and automatic attachments only.
 */
import { inspectAppliedThreePropsPath, resolveProperty } from './props.js';

const ARRAY_INDEX = /-\d+$/;

export type EffectiveAttachment = string | null | undefined;

export interface AttachmentState<Parent extends object = object, Child = unknown> {
	readonly kind: 'string';
	readonly parent: Parent;
	readonly child: Child;
	readonly path: string;
	readonly root: any;
	readonly key: string;
	readonly previous: unknown;
	active: boolean;
}

function isPropertyRoot(value: unknown): value is Record<string, any> {
	return value !== null && (typeof value === 'object' || typeof value === 'function');
}

function requirePropertyRoot(value: unknown, path: string): asserts value is Record<string, any> {
	if (!isPropertyRoot(value)) {
		throw new Error(
			`@octanejs/three: Cannot attach to ${JSON.stringify(path)} because its parent is not an object.`,
		);
	}
}

/**
 * Return the authored attachment, or R3F's automatic geometry/material target.
 * An explicit null suppresses automatic attachment.
 */
export function getEffectiveAttachment(
	object: unknown,
	authored: EffectiveAttachment = undefined,
): EffectiveAttachment {
	if (authored !== undefined) return authored;
	if ((object as { isBufferGeometry?: boolean } | null)?.isBufferGeometry === true) {
		return 'geometry';
	}
	if ((object as { isMaterial?: boolean } | null)?.isMaterial === true) return 'material';
	return undefined;
}

/** Validate a final string attachment target without mutating its parent. */
export function validateStringAttachment(
	parent: object,
	path: string,
	overrides: Readonly<Record<string, unknown>> = {},
): void {
	if (path.length === 0) throw new TypeError('@octanejs/three: attach must not be empty.');

	// Indexed attachments first replace the target property with an array when
	// necessary, so only the array property's parent must already be object-like.
	const targetPath = ARRAY_INDEX.test(path) ? path.replace(ARRAY_INDEX, '') : path;
	const status = inspectAppliedThreePropsPath(parent, targetPath, overrides);
	if (status === 'valid') return;
	const reason =
		status === 'uncertain'
			? 'a custom setter makes its final parent shape uncertain'
			: 'its parent is not an object';
	throw new Error(`@octanejs/three: Cannot attach to ${JSON.stringify(path)} because ${reason}.`);
}

/** Attach a child at a direct or dash-pierced Three property path. */
export function attachString<Parent extends object, Child>(
	parent: Parent,
	child: Child,
	path: string,
): AttachmentState<Parent, Child> {
	if (path.length === 0) throw new TypeError('@octanejs/three: attach must not be empty.');

	// R3F's `material-0` convention creates the target array when necessary.
	if (ARRAY_INDEX.test(path)) {
		const arrayPath = path.replace(ARRAY_INDEX, '');
		const arrayTarget = resolveProperty(parent, arrayPath);
		requirePropertyRoot(arrayTarget.root, arrayPath);
		if (!Array.isArray(arrayTarget.root[arrayTarget.key])) {
			arrayTarget.root[arrayTarget.key] = [];
		}
	}

	const target = resolveProperty(parent, path);
	requirePropertyRoot(target.root, path);
	const previous = target.root[target.key];
	target.root[target.key] = child;
	return {
		kind: 'string',
		parent,
		child,
		path,
		root: target.root,
		key: target.key,
		previous,
		active: true,
	};
}

/** Restore the property value captured by `attachString`, exactly once. */
export function detachAttachment(state: AttachmentState): void {
	if (!state.active) return;
	state.active = false;
	if (state.previous === undefined) delete state.root[state.key];
	else state.root[state.key] = state.previous;
}
