/**
 * Replays a captured pre-activation interaction on its original target. Both the
 * renderer's island activator and the renderer-free binding activator use it,
 * so it must stay outside the client runtime's graph.
 */
export function cloneHydrationReplayEvent(event: Event, target: Element): Event {
	const clone = constructHydrationReplayEvent(event, target);
	// No event init dictionary carries `timeStamp`: every constructor stamps the
	// replay-time clock. Consumers measure input against the original clock (how
	// long a press is held, pointerdown to pointerup), so the replay keeps it as an
	// own property shadowing Event.prototype's getter, configurable like the
	// getter. A boundary that replays its parent's replay reads that own property,
	// so nested replay still reports the original input's time. `isTrusted` is
	// untouched: the clone is a constructed, untrusted event.
	Object.defineProperty(clone, 'timeStamp', { value: event.timeStamp, configurable: true });
	return clone;
}

function constructHydrationReplayEvent(event: Event, target: Element): Event {
	// Event constructors are realm-specific, so the clone is always built with the
	// TARGET's constructors: hydrating an iframe-owned root from its parent realm
	// must still replay an event the iframe's own code recognizes. A detached
	// synthetic Document has no defaultView and falls back to the ambient realm.
	const realm = target.ownerDocument.defaultView ?? globalThis;
	// Same-realm replay is the overwhelmingly common case, so it stays a plain
	// constructor walk: no brand string, no comparisons beyond `instanceof`.
	// PointerEvent extends MouseEvent, so it must be tested first or pointer-
	// specific metadata (pressure, pointerId, tilt, etc.) is discarded.
	if (realm.PointerEvent !== undefined && event instanceof realm.PointerEvent) {
		return new realm.PointerEvent(event.type, event);
	}
	if (realm.KeyboardEvent !== undefined && event instanceof realm.KeyboardEvent) {
		return new realm.KeyboardEvent(event.type, event);
	}
	if (realm.MouseEvent !== undefined && event instanceof realm.MouseEvent) {
		return new realm.MouseEvent(event.type, event);
	}
	if (realm.FocusEvent !== undefined && event instanceof realm.FocusEvent) {
		return new realm.FocusEvent(event.type, event);
	}
	if (realm.InputEvent !== undefined && event instanceof realm.InputEvent) {
		return new realm.InputEvent(event.type, event);
	}
	if (realm.CompositionEvent !== undefined && event instanceof realm.CompositionEvent) {
		return new realm.CompositionEvent(event.type, event);
	}
	if (realm.TouchEvent !== undefined && event instanceof realm.TouchEvent) {
		return cloneHydrationTouchEvent(event, realm.TouchEvent);
	}
	// Cold: a programmatic dispatch may cross realms, where the original event
	// came from a parent Window while its target belongs to an iframe Window (or
	// the reverse). No local constructor claims it, but Web IDL's toStringTag
	// still reports the platform family across that identity boundary.
	const brand = Object.prototype.toString.call(event);
	if (realm.PointerEvent !== undefined && brand === '[object PointerEvent]') {
		return new realm.PointerEvent(event.type, event);
	}
	if (realm.KeyboardEvent !== undefined && brand === '[object KeyboardEvent]') {
		return new realm.KeyboardEvent(event.type, event);
	}
	if (realm.MouseEvent !== undefined && brand === '[object MouseEvent]') {
		return new realm.MouseEvent(event.type, event);
	}
	if (realm.FocusEvent !== undefined && brand === '[object FocusEvent]') {
		return new realm.FocusEvent(event.type, event);
	}
	if (realm.InputEvent !== undefined && brand === '[object InputEvent]') {
		return new realm.InputEvent(event.type, event);
	}
	if (realm.CompositionEvent !== undefined && brand === '[object CompositionEvent]') {
		return new realm.CompositionEvent(event.type, event);
	}
	if (realm.TouchEvent !== undefined && brand === '[object TouchEvent]') {
		return cloneHydrationTouchEvent(event as TouchEvent, realm.TouchEvent);
	}
	return new realm.Event(event.type, event);
}

function cloneHydrationTouchEvent(
	event: TouchEvent,
	TouchEventImpl: typeof TouchEvent,
): TouchEvent {
	return new TouchEventImpl(event.type, {
		bubbles: event.bubbles,
		cancelable: event.cancelable,
		composed: event.composed,
		detail: event.detail,
		ctrlKey: event.ctrlKey,
		shiftKey: event.shiftKey,
		altKey: event.altKey,
		metaKey: event.metaKey,
		touches: Array.from(event.touches),
		targetTouches: Array.from(event.targetTouches),
		changedTouches: Array.from(event.changedTouches),
	});
}
