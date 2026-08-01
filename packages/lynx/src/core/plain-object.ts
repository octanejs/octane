/**
 * Cross-realm plain-object test.
 *
 * The two Lynx threads run in separate JS realms in production — on Lynx for Web
 * the background is its own iframe/worker — so a value built on one thread (a
 * transport message, host-prop bag, worklet capture, or engine lifecycle record)
 * is a plain object whose prototype is *that realm's* `Object.prototype`, never
 * identical to this realm's. A `getPrototypeOf(value) === Object.prototype`
 * identity test therefore rejects every cross-realm value; it only ever passed
 * because the jsdom test environment runs both threads in a single realm.
 *
 * Accept a null prototype, or any prototype that is itself one hop from null —
 * the shape of every realm's `Object.prototype`. Deeper chains (class instances,
 * host objects such as Date/Map) are still rejected. Callers separately enforce
 * enumerable, non-accessor, symbol-free data, so this predicate only decides the
 * "plain shape" question that must survive a realm boundary.
 *
 * `value` must already be a non-null, non-array object.
 */
export function hasCrossRealmPlainPrototype(value: object): boolean {
	const prototype = Object.getPrototypeOf(value);
	return prototype === null || Object.getPrototypeOf(prototype) === null;
}
