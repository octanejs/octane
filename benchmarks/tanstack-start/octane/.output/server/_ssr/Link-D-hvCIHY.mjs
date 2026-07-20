import { A as useCallback, C as ssrInnerHtml, L as withSlot, N as useRef, P as useState, T as ssrSnapshotSpread, a as flushSync, b as ssrControl, c as markChildrenBlock, f as ssrArm, g as ssrChild, h as ssrBlock, m as ssrAttrs, o as hookSlots, s as isChildrenBlock, y as ssrComponent } from "./runtime.server-w393t-7O.mjs";
import { A as deepEqual, E as removeTrailingSlash, M as functionalUpdate, N as isDangerousProtocol, c as splitSlot, d as useRouter, l as subSlot, s as useStore, w as exactPathTest } from "./ssr.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/Link-D-hvCIHY.js
var preloadWarning = "Error preloading route! ☝️";
var STATIC_EMPTY_OBJECT = {};
var STATIC_ACTIVE_OBJECT = { class: "active" };
var STATIC_DISABLED_PROPS = {
	role: "link",
	"aria-disabled": true
};
var STATIC_ACTIVE_PROPS = {
	"data-status": "active",
	"aria-current": "page"
};
var STATIC_TRANSITIONING_PROPS = { "data-transitioning": "transitioning" };
var timeoutMap = /* @__PURE__ */ new WeakMap();
var composeHandlers = (handlers) => (e) => {
	for (const handler of handlers) {
		if (!handler) continue;
		if (e.defaultPrevented) return;
		handler(e);
	}
};
function getHrefOption(publicHref, external, history, disabled) {
	if (disabled) return;
	if (external) return {
		href: publicHref,
		external: true
	};
	return {
		href: history.createHref(publicHref) || "/",
		external: false
	};
}
function isSafeInternal(to) {
	if (typeof to !== "string") return false;
	const zero = to.charCodeAt(0);
	if (zero === 47) return to.charCodeAt(1) !== 47;
	return zero === 46;
}
function isCtrlEvent(e) {
	return !!(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey);
}
function mergeStyles(base, active, inactive) {
	if (!base && !active && !inactive) return;
	const parts = [
		base,
		active,
		inactive
	].filter(Boolean);
	if (parts.length === 1) return parts[0];
	if (parts.some((p) => typeof p === "string")) return parts.map((p) => typeof p === "string" ? p.replace(/;\s*$/, "") : Object.entries(p).map(([k, v]) => `${k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())}:${v}`).join(";")).join(";");
	return Object.assign({}, ...parts);
}
function useLinkProps(...args) {
	const [user, slot] = splitSlot(args);
	const options = user[0] ?? {};
	const router = useRouter();
	const { activeProps, inactiveProps, activeOptions, to, preload: userPreload, preloadDelay: userPreloadDelay, preloadIntentProximity: _preloadIntentProximity, hashScrollIntoView, replace, startTransition, resetScroll, viewTransition, children: _children, target, disabled, style, class: klass, className, onClick, onBlur, onFocus, onMouseEnter, onMouseLeave, onTouchStart, ignoreBlocker, ref: userRef, params: _params, search: _search, hash: _hash, state: _state, mask: _mask, reloadDocument: _reloadDocument, unsafeRelative: _unsafeRelative, from: _from, _fromLocation, ...propsSafeToSpread } = options;
	const currentLocation = useStore(router.stores.location, (l) => l, (prev, next) => prev.href === next.href, subSlot(slot, "lp:loc"));
	const next = router.buildLocation({
		_fromLocation: currentLocation,
		...options
	});
	const hrefOption = getHrefOption(next.maskedLocation ? next.maskedLocation.publicHref : next.publicHref, next.maskedLocation ? next.maskedLocation.external : next.external, router.history, disabled);
	const externalLink = (() => {
		if (hrefOption?.external) {
			if (isDangerousProtocol(hrefOption.href, router.protocolAllowlist)) return;
			return hrefOption.href;
		}
		if (isSafeInternal(to)) return;
		if (typeof to !== "string" || to.indexOf(":") === -1) return;
		try {
			new URL(to);
			if (isDangerousProtocol(to, router.protocolAllowlist)) return;
			return to;
		} catch {}
	})();
	const isActive = (() => {
		if (externalLink) return false;
		if (activeOptions?.exact) {
			if (!exactPathTest(currentLocation.pathname, next.pathname, router.basepath)) return false;
		} else {
			const currentPathSplit = removeTrailingSlash(currentLocation.pathname, router.basepath);
			const nextPathSplit = removeTrailingSlash(next.pathname, router.basepath);
			if (!(currentPathSplit.startsWith(nextPathSplit) && (currentPathSplit.length === nextPathSplit.length || currentPathSplit[nextPathSplit.length] === "/"))) return false;
		}
		if (activeOptions?.includeSearch ?? true) {
			if (!deepEqual(currentLocation.search, next.search, {
				partial: !activeOptions?.exact,
				ignoreUndefined: !activeOptions?.explicitUndefined
			})) return false;
		}
		if (activeOptions?.includeHash) return currentLocation.hash === next.hash;
		return true;
	})();
	const resolvedActiveProps = isActive ? functionalUpdate(activeProps, {}) ?? STATIC_ACTIVE_OBJECT : STATIC_EMPTY_OBJECT;
	const resolvedInactiveProps = isActive ? STATIC_EMPTY_OBJECT : functionalUpdate(inactiveProps, {}) ?? STATIC_EMPTY_OBJECT;
	const resolvedClass = [
		klass ?? className,
		resolvedActiveProps.class ?? resolvedActiveProps.className,
		resolvedInactiveProps.class ?? resolvedInactiveProps.className
	].filter(Boolean);
	const resolvedStyle = mergeStyles(style, resolvedActiveProps.style, resolvedInactiveProps.style);
	const [isTransitioning, setIsTransitioning] = useState(false, subSlot(slot, "lp:t"));
	useRef(false, subSlot(slot, "lp:rf"));
	const elRef = useRef(null, subSlot(slot, "lp:el"));
	const preload = options.reloadDocument || externalLink ? false : userPreload ?? router.options.defaultPreload;
	const preloadDelay = userPreloadDelay ?? router.options.defaultPreloadDelay ?? 0;
	const doPreload = useCallback(() => {
		router.preloadRoute({
			...options,
			_builtLocation: next
		}).catch((err) => {
			console.warn(err);
			console.warn(preloadWarning);
		});
	}, [router, next.href], subSlot(slot, "lp:dp"));
	subSlot(slot, "lp:io");
	subSlot(slot, "lp:pr");
	const handleClick = (e) => {
		const elementTarget = e.currentTarget?.getAttribute?.("target");
		const effectiveTarget = target !== void 0 ? target : elementTarget;
		if (!disabled && !isCtrlEvent(e) && !e.defaultPrevented && (!effectiveTarget || effectiveTarget === "_self") && e.button === 0) {
			e.preventDefault();
			flushSync(() => {
				setIsTransitioning(true);
			});
			const unsub = router.subscribe("onResolved", () => {
				unsub();
				setIsTransitioning(false);
			});
			router.navigate({
				...options,
				replace,
				resetScroll,
				hashScrollIntoView,
				startTransition,
				viewTransition,
				ignoreBlocker
			});
		}
	};
	const captureRef = (el) => {
		elRef.current = el;
	};
	const composedRef = userRef ? [captureRef, userRef] : captureRef;
	if (externalLink) return {
		...propsSafeToSpread,
		ref: composedRef,
		href: externalLink,
		...target !== void 0 && { target },
		...disabled !== void 0 && { disabled },
		...resolvedStyle !== void 0 && { style: resolvedStyle },
		...resolvedClass.length > 0 && { class: resolvedClass },
		...onClick && { onClick },
		...onBlur && { onBlur },
		...onFocus && { onFocus },
		...onMouseEnter && { onMouseEnter },
		...onMouseLeave && { onMouseLeave },
		...onTouchStart && { onTouchStart }
	};
	const enqueueIntentPreload = (e) => {
		if (disabled || preload !== "intent") return;
		if (!preloadDelay) {
			doPreload();
			return;
		}
		const eventTarget = e.currentTarget;
		if (timeoutMap.has(eventTarget)) return;
		const id = setTimeout(() => {
			timeoutMap.delete(eventTarget);
			doPreload();
		}, preloadDelay);
		timeoutMap.set(eventTarget, id);
	};
	const handleTouchStart = () => {
		if (disabled || preload !== "intent") return;
		doPreload();
	};
	const handleLeave = (e) => {
		if (disabled || !preload || !preloadDelay) return;
		const eventTarget = e.currentTarget;
		const id = timeoutMap.get(eventTarget);
		if (id) {
			clearTimeout(id);
			timeoutMap.delete(eventTarget);
		}
	};
	return {
		...propsSafeToSpread,
		...resolvedActiveProps,
		...resolvedInactiveProps,
		href: hrefOption?.href,
		ref: composedRef,
		onClick: composeHandlers([onClick, handleClick]),
		onBlur: composeHandlers([onBlur, handleLeave]),
		onFocus: composeHandlers([onFocus, enqueueIntentPreload]),
		onMouseEnter: composeHandlers([onMouseEnter, enqueueIntentPreload]),
		onMouseLeave: composeHandlers([onMouseLeave, handleLeave]),
		onTouchStart: composeHandlers([onTouchStart, handleTouchStart]),
		disabled: !!disabled,
		...target !== void 0 && { target },
		...resolvedStyle !== void 0 && { style: resolvedStyle },
		...resolvedClass.length > 0 && { class: resolvedClass },
		...disabled && STATIC_DISABLED_PROPS,
		...isActive && STATIC_ACTIVE_PROPS,
		...isTransitioning && STATIC_TRANSITIONING_PROPS
	};
}
var _h$0 = /* @__PURE__ */ Symbol(/* @__PURE__ */ hookSlots(1));
var Link = function Link(props, __s, __extra) {
	const { _asChild: AsChild, children, ...rest } = props;
	const linkProps = withSlot(_h$0, useLinkProps, rest, _h$0);
	const { disabled: _disabled, ...aProps } = linkProps;
	const resolvedChildren = typeof children === "function" && !isChildrenBlock(children) ? children({
		isActive: linkProps["data-status"] === "active",
		isTransitioning: linkProps["data-transitioning"] === "transitioning"
	}) : children;
	function __sif$0(__props, __s, __extra) {
		function __schildren$1(__props, __s, __extra) {
			return ssrChild(resolvedChildren, __s);
		}
		return ssrComponent(__s, AsChild, {
			...linkProps,
			"children": markChildrenBlock(__schildren$1)
		});
	}
	function __selse$2(__props, __s, __extra) {
		return (() => {
			const __sp0 = ssrSnapshotSpread(aProps);
			return "<a" + ssrAttrs([[true, __sp0]], "a", "opaque", false) + ">" + (ssrInnerHtml([[__sp0 != null && Object.prototype.propertyIsEnumerable.call(__sp0, "dangerouslySetInnerHTML"), __sp0 != null ? __sp0.dangerouslySetInnerHTML : void 0]], () => ssrChild(resolvedChildren, __s), false, []) ?? ssrChild(resolvedChildren, __s)) + "</a>";
		})();
	}
	return ssrBlock(ssrControl("i11vqi3g", () => AsChild ? ssrArm("then", () => ssrBlock(__sif$0(void 0, __s))) : ssrArm("else", () => ssrBlock(__selse$2(void 0, __s)))));
};
//#endregion
export { Link as t };
