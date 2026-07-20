import { A as useCallback, N as useRef, i as createElement, j as useContext, k as use } from "./runtime.server-w393t-7O.mjs";
import { D as trimPathLeft, F as replaceEqualDeep, O as trimPathRight, P as isModuleNotFoundError, S as rootRouteId, T as joinPaths, c as splitSlot, d as useRouter, k as invariant, l as subSlot, n as TSS_SERVER_FUNCTION, r as getServerFnById, s as useStore, u as matchContext, x as redirect } from "./ssr.mjs";
import { t as Link } from "./Link-D-hvCIHY.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/createSsrRpc-BTuhnJRJ.js
var BaseRoute = class {
	get to() {
		return this._to;
	}
	get id() {
		return this._id;
	}
	get path() {
		return this._path;
	}
	get fullPath() {
		return this._fullPath;
	}
	constructor(options) {
		this.init = (opts) => {
			this.originalIndex = opts.originalIndex;
			const options = this.options;
			const isRoot = !options?.path && !options?.id;
			this.parentRoute = this.options.getParentRoute?.();
			if (isRoot) this._path = rootRouteId;
			else if (!this.parentRoute) invariant();
			let path = isRoot ? rootRouteId : options?.path;
			if (path && path !== "/") path = trimPathLeft(path);
			const customId = options?.id || path;
			let id = isRoot ? rootRouteId : joinPaths([this.parentRoute.id === "__root__" ? "" : this.parentRoute.id, customId]);
			if (path === "__root__") path = "/";
			if (id !== "__root__") id = joinPaths(["/", id]);
			const fullPath = id === "__root__" ? "/" : joinPaths([this.parentRoute.fullPath, path]);
			this._path = path;
			this._id = id;
			this._fullPath = fullPath;
			this._to = trimPathRight(fullPath);
		};
		this.addChildren = (children) => {
			return this._addFileChildren(children);
		};
		this._addFileChildren = (children) => {
			if (Array.isArray(children)) this.children = children;
			if (typeof children === "object" && children !== null) this.children = Object.values(children);
			return this;
		};
		this._addFileTypes = () => {
			return this;
		};
		this.updateLoader = (options) => {
			Object.assign(this.options, options);
			return this;
		};
		this.update = (options) => {
			Object.assign(this.options, options);
			return this;
		};
		this.lazy = (lazyFn) => {
			this.lazyFn = lazyFn;
			return this;
		};
		this.redirect = (opts) => redirect({
			from: this.fullPath,
			...opts
		});
		this.options = options || {};
		this.isRoot = !options?.getParentRoute;
		if (options?.id && options?.path) throw new Error(`Route cannot have both an 'id' and a 'path' option.`);
	}
};
var BaseRootRoute = class extends BaseRoute {
	constructor(options) {
		super(options);
	}
};
var dummyStore = {
	get() {},
	subscribe() {
		return { unsubscribe() {} };
	}
};
function useStructuralSharing(opts, router, slot) {
	const previousResult = useRef(void 0, subSlot(slot, "ss"));
	return (slice) => {
		const selected = opts?.select ? opts.select(slice) : slice;
		if (opts?.structuralSharing ?? router.options.defaultStructuralSharing) return previousResult.current = replaceEqualDeep(previousResult.current, selected);
		return selected;
	};
}
function useMatchImpl(args) {
	const [user, slot] = splitSlot(args);
	const opts = user[0] ?? {};
	const router = useRouter();
	const nearestMatchId = useContext(matchContext);
	const matchStore = opts.from ? router.stores.getRouteMatchStore(opts.from) : router.stores.matchStores.get(nearestMatchId);
	const selector = useStructuralSharing(opts, router, subSlot(slot, "m"));
	const matchSelection = useStore(matchStore ?? dummyStore, (match) => match ? selector(match) : dummyStore, void 0, subSlot(slot, "m:us"));
	if (matchSelection !== dummyStore) return matchSelection;
	if (opts.shouldThrow ?? true) throw new Error(`Invariant failed: Could not find ${opts.from ? `an active match from "${opts.from}"` : "a nearest match!"}`);
}
function useParamsImpl(args) {
	const [user, slot] = splitSlot(args);
	const opts = user[0] ?? {};
	return useMatchImpl([{
		from: opts.from,
		strict: opts.strict,
		shouldThrow: opts.shouldThrow,
		structuralSharing: opts.structuralSharing,
		select: (match) => {
			const params = opts.strict === false ? match.params : match._strictParams;
			return opts.select ? opts.select(params) : params;
		}
	}, subSlot(slot, "params")]);
}
function useSearchImpl(args) {
	const [user, slot] = splitSlot(args);
	const opts = user[0] ?? {};
	return useMatchImpl([{
		from: opts.from,
		strict: opts.strict,
		shouldThrow: opts.shouldThrow,
		structuralSharing: opts.structuralSharing,
		select: (match) => opts.select ? opts.select(match.search) : match.search
	}, subSlot(slot, "search")]);
}
function useLoaderDataImpl(args) {
	const [user, slot] = splitSlot(args);
	const opts = user[0] ?? {};
	return useMatchImpl([{
		from: opts.from,
		strict: opts.strict,
		structuralSharing: opts.structuralSharing,
		select: (match) => opts.select ? opts.select(match.loaderData) : match.loaderData
	}, subSlot(slot, "loader")]);
}
function useLoaderDepsImpl(args) {
	const [user, slot] = splitSlot(args);
	const { select, ...rest } = user[0] ?? {};
	return useMatchImpl([{
		...rest,
		select: (match) => select ? select(match.loaderDeps) : match.loaderDeps
	}, subSlot(slot, "deps")]);
}
function useRouteContextImpl(args) {
	const [user, slot] = splitSlot(args);
	const opts = user[0] ?? {};
	return useMatchImpl([{
		...opts,
		select: (match) => opts.select ? opts.select(match.context) : match.context
	}, subSlot(slot, "ctx")]);
}
function useLocation(...args) {
	return useLocationImpl(args);
}
function useLocationImpl(args) {
	const [user, slot] = splitSlot(args);
	const opts = user[0] ?? {};
	const router = useRouter();
	return useStore(router.stores.location, useStructuralSharing(opts, router, subSlot(slot, "loc")), void 0, subSlot(slot, "loc:us"));
}
function useMatchesImpl(args) {
	const [user, slot] = splitSlot(args);
	const opts = user[0] ?? {};
	const router = useRouter();
	return useStore(router.stores.matches, useStructuralSharing(opts, router, subSlot(slot, "matches")), void 0, subSlot(slot, "matches:us"));
}
function useParentMatchesImpl(args) {
	const [user, slot] = splitSlot(args);
	const opts = user[0] ?? {};
	const contextMatchId = useContext(matchContext);
	return useMatchesImpl([{
		select: (matches) => {
			matches = matches.slice(0, matches.findIndex((d) => d.id === contextMatchId));
			return opts.select ? opts.select(matches) : matches;
		},
		structuralSharing: opts.structuralSharing
	}, subSlot(slot, "parents")]);
}
function useChildMatchesImpl(args) {
	const [user, slot] = splitSlot(args);
	const opts = user[0] ?? {};
	const contextMatchId = useContext(matchContext);
	return useMatchesImpl([{
		select: (matches) => {
			matches = matches.slice(matches.findIndex((d) => d.id === contextMatchId) + 1);
			return opts.select ? opts.select(matches) : matches;
		},
		structuralSharing: opts.structuralSharing
	}, subSlot(slot, "children")]);
}
function useNavigateImpl(args) {
	const [user, slot] = splitSlot(args);
	const opts = user[0] ?? {};
	const router = useRouter(opts.router ? { router: opts.router } : void 0);
	return useCallback((options) => router.navigate({
		...options,
		from: options?.from ?? opts.from
	}), [opts.from, router], subSlot(slot, "nav"));
}
/** @internal Framework primitives use explicit Octane hook slots. */
var internalHooks = {
	useMatch: (...args) => useMatchImpl(args),
	useParams: (...args) => useParamsImpl(args),
	useSearch: (...args) => useSearchImpl(args),
	useLoaderData: (...args) => useLoaderDataImpl(args),
	useLoaderDeps: (...args) => useLoaderDepsImpl(args),
	useRouteContext: (...args) => useRouteContextImpl(args),
	useLocation: (...args) => useLocationImpl(args),
	useMatches: (...args) => useMatchesImpl(args),
	useParentMatches: (...args) => useParentMatchesImpl(args),
	useChildMatches: (...args) => useChildMatchesImpl(args),
	useNavigate: (...args) => useNavigateImpl(args)
};
function attachRouteHooks(self, strictLoaderHooks) {
	self.useMatch = (...args) => {
		const [user, slot] = splitSlot(args);
		const opts = user[0] ?? {};
		return internalHooks.useMatch({
			select: opts.select,
			structuralSharing: opts.structuralSharing,
			from: self.id
		}, subSlot(slot, "r:m"));
	};
	self.useRouteContext = (...args) => {
		const [user, slot] = splitSlot(args);
		return internalHooks.useRouteContext({
			...user[0] ?? {},
			from: self.id
		}, subSlot(slot, "r:ctx"));
	};
	self.useSearch = (...args) => {
		const [user, slot] = splitSlot(args);
		const opts = user[0] ?? {};
		return internalHooks.useSearch({
			select: opts.select,
			structuralSharing: opts.structuralSharing,
			from: self.id
		}, subSlot(slot, "r:s"));
	};
	self.useParams = (...args) => {
		const [user, slot] = splitSlot(args);
		const opts = user[0] ?? {};
		return internalHooks.useParams({
			select: opts.select,
			structuralSharing: opts.structuralSharing,
			from: self.id
		}, subSlot(slot, "r:p"));
	};
	self.useLoaderDeps = (...args) => {
		const [user, slot] = splitSlot(args);
		const opts = user[0] ?? {};
		return internalHooks.useLoaderDeps(strictLoaderHooks ? {
			...opts,
			from: self.id
		} : {
			...opts,
			from: self.id,
			strict: false
		}, subSlot(slot, "r:d"));
	};
	self.useLoaderData = (...args) => {
		const [user, slot] = splitSlot(args);
		const opts = user[0] ?? {};
		return internalHooks.useLoaderData(strictLoaderHooks ? {
			...opts,
			from: self.id
		} : {
			...opts,
			from: self.id,
			strict: false
		}, subSlot(slot, "r:l"));
	};
}
function attachRouteNavigation(self) {
	self.useNavigate = (...args) => {
		const [, slot] = splitSlot(args);
		return internalHooks.useNavigate({ from: self.fullPath }, subSlot(slot, "r:n"));
	};
	self.Link = (props) => createElement(Link, {
		from: self.fullPath,
		...props
	});
}
var Route = class extends BaseRoute {
	/** @deprecated Use the `createRoute` function instead. */
	constructor(options) {
		super(options);
		attachRouteHooks(this, true);
		attachRouteNavigation(this);
	}
};
function createRoute(options) {
	return new Route(options);
}
var RootRoute = class extends BaseRootRoute {
	/** @deprecated Use `createRootRoute()` instead. */
	constructor(options) {
		super(options);
		attachRouteHooks(this, true);
		attachRouteNavigation(this);
	}
};
function createRootRoute(options) {
	return new RootRoute(options);
}
function createFileRoute(path) {
	return new FileRoute(path, { silent: true }).createRoute;
}
/** @deprecated Use `createFileRoute(path)(options)` instead. */
var FileRoute = class {
	path;
	silent;
	constructor(path, _opts) {
		this.path = path;
		this.silent = _opts?.silent;
	}
	createRoute = (options) => {
		const route = createRoute(options);
		route.isRoot = false;
		return route;
	};
};
var EXTERNAL_HYDRATION_PROMISE = Symbol.for("octane.external-hydration-promise");
var externalHydrationThenables = /* @__PURE__ */ new WeakMap();
/**
* Wrap a router-owned promise so Octane still schedules its suspense boundary,
* while TanStack's serializer remains the only owner of its hydration value.
*/
function toExternalHydrationThenable(thenable) {
	const key = thenable;
	const existing = externalHydrationThenables.get(key);
	if (existing) return existing;
	let localStatus;
	let localValue;
	let localReason;
	let hasLocalValue = false;
	let hasLocalReason = false;
	const externalThenable = {
		[EXTERNAL_HYDRATION_PROMISE]: true,
		get status() {
			return localStatus ?? readThenableStatus(thenable);
		},
		set status(status) {
			localStatus = status;
		},
		get value() {
			return hasLocalValue ? localValue : readThenableProperty(thenable, "value");
		},
		set value(value) {
			hasLocalValue = true;
			localValue = value;
		},
		get reason() {
			return hasLocalReason ? localReason : readThenableProperty(thenable, "reason");
		},
		set reason(reason) {
			hasLocalReason = true;
			localReason = reason;
		},
		then(onfulfilled, onrejected) {
			return thenable.then(onfulfilled, onrejected);
		}
	};
	externalHydrationThenables.set(key, externalThenable);
	return externalThenable;
}
function readThenableStatus(thenable) {
	const status = readThenableProperty(thenable, "status");
	return status === "pending" || status === "fulfilled" || status === "rejected" ? status : void 0;
}
function readThenableProperty(thenable, property) {
	try {
		return thenable[property];
	} catch {
		return;
	}
}
function lazyRouteComponent(importer, exportName) {
	let loadPromise;
	let comp;
	let error;
	let reload = false;
	const load = () => {
		if (!loadPromise) loadPromise = importer().then((res) => {
			loadPromise = void 0;
			comp = res[exportName ?? "default"];
		}).catch((err) => {
			error = err;
			if (isModuleNotFoundError(error) && error instanceof Error && typeof window !== "undefined" && typeof sessionStorage !== "undefined") {
				const key = `tanstack_router_reload:${error.message}`;
				if (!sessionStorage.getItem(key)) {
					sessionStorage.setItem(key, "1");
					reload = true;
				}
			}
		});
		return loadPromise;
	};
	const Lazy = (props) => {
		if (reload) {
			window.location.reload();
			throw new Promise(() => {});
		}
		if (error) throw error;
		if (!comp) use(toExternalHydrationThenable(load()));
		return createElement(comp, props);
	};
	Lazy.preload = load;
	return Lazy;
}
var createSsrRpc = (functionId) => {
	const url = "/_serverFn/" + functionId;
	const serverFnMeta = { id: functionId };
	const fn = async (...args) => {
		return (await getServerFnById(functionId, { origin: "server" }))(...args);
	};
	return Object.assign(fn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
//#endregion
export { toExternalHydrationThenable as a, lazyRouteComponent as i, createRootRoute as n, useLocation as o, createSsrRpc as r, createFileRoute as t };
