import {
	Color,
	Euler,
	Layers,
	Matrix3,
	Matrix4,
	Quaternion,
	Vector2,
	Vector3,
	Vector4,
} from 'three';

// These value classes occur on ordinary Three objects even when they are not
// authored as scene intrinsics. Keep their identities explicit so bundlers can
// discard the rest of the Three namespace and custom subclasses stay untrusted.
const TRUSTED_THREE_CONSTRUCTORS = new WeakSet<Function>([
	Color,
	Euler,
	Layers,
	Matrix3,
	Matrix4,
	Quaternion,
	Vector2,
	Vector3,
	Vector4,
]);

/** Accept constructors obtained from compiler-owned or full Three namespace registration. */
export function registerTrustedThreeConstructor(value: unknown): void {
	if (typeof value === 'function') TRUSTED_THREE_CONSTRUCTORS.add(value);
}

/** Only an exact Three constructor, never a derived custom class, is trusted. */
export function isTrustedThreeConstructor(value: unknown): boolean {
	return typeof value === 'function' && TRUSTED_THREE_CONSTRUCTORS.has(value);
}
