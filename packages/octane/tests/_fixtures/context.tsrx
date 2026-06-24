import { useState, createContext, use, createPortal } from 'octane-ts';

// Multiple distinct contexts in one tree.
export const ThemeCtx = createContext('light');
export const UserCtx = createContext('anon');
export const CountCtx = createContext(0);

// Reads a single context value.
export function ThemeReader() @{
	const v = use(ThemeCtx);
	<span class="theme">
		{v as string}
	</span>
}

export function UserReader() @{
	const v = use(UserCtx);
	<span class="user">
		{v as string}
	</span>
}

export function CountReader() @{
	const v = use(CountCtx);
	<span class="count">
		{v as string}
	</span>
}

// Reads two contexts in one component.
export function CombinedReader() @{
	const theme = use(ThemeCtx);
	const user = use(UserCtx);
	<span class="combined">
		{theme + '/' + user as string}
	</span>
}

// Reads a context that has NO Provider anywhere above it: must resolve to the
// context default on EVERY render. Exercises the resolved-provider cache's
// "cached default" fast path across re-renders — the consumer's first read
// records "no provider", and the invariant (no closer Provider can appear above
// a surviving consumer) means later reads must keep returning the default.
export function BareReader(props) @{
	const v = use(CountCtx);
	<span class="bare">
		{v + ':' + props.tick as string}
	</span>
}

// Provider value updates → consumers re-render.
export function DynamicProvider() @{
	const [v, setV] = useState('init');
	<div>
		<button id="swap" onClick={() => setV(v === 'init' ? 'changed' : 'init')}>{'swap'}</button>
		<ThemeCtx.Provider value={v}>
			<ThemeReader />
		</ThemeCtx.Provider>
	</div>
}

// One consumer reads TWO contexts; bumping the outer Provider re-renders it.
// Exercises the cache's multi-entry path across re-renders: the changed context
// must read live (new value) AND the unchanged one must stay correct — a cache
// that overwrote the wrong entry or returned a stale slot would fail here.
export function CombinedDynamic() @{
	const [theme, setTheme] = useState('t0');
	<div>
		<button id="bump" onClick={() => setTheme(theme === 't0' ? 't1' : 't0')}>{'bump'}</button>
		<ThemeCtx.Provider value={theme}>
			<UserCtx.Provider value="alice">
				<CombinedReader />
			</UserCtx.Provider>
		</ThemeCtx.Provider>
	</div>
}

// A Provider wrapped in an @if: toggling `show` tears down the Provider's scope
// and, on the next show, builds a FRESH one — with a different `value` each time.
// The consumer inside must always read the current Provider's value, never one
// cached from a prior mount. This is the "torn-down/replaced provider scope"
// case that the resolved-provider cache used to guard defensively: locks in that
// a remount never yields a stale context read.
export function RemountingProvider(props) @{
	@if (props.show) {
		<CountCtx.Provider value={props.value}>
			<CountReader />
		</CountCtx.Provider>
	} @else {
		<span class="off">{'off'}</span>
	}
}

// Multiple sibling consumers all see the same value.
export function Siblings() @{
	<ThemeCtx.Provider value="dark">
		<div>
			<div class="one">
				<ThemeReader />
			</div>
			<div class="two">
				<ThemeReader />
			</div>
			<div class="three">
				<ThemeReader />
			</div>
		</div>
	</ThemeCtx.Provider>
}

// Distinct contexts — each consumer reads its own; no leak.
export function TwoContexts() @{
	<ThemeCtx.Provider value="dark">
		<UserCtx.Provider value="alice">
			<div>
				<ThemeReader />
				<UserReader />
				<CombinedReader />
			</div>
		</UserCtx.Provider>
	</ThemeCtx.Provider>
}

// use() inside an if-branch — the read happens only when the branch mounts.
export function ConditionalUse(props) @{
	<ThemeCtx.Provider value="dark">
		<div>
			@if (props.show) {
				<ThemeReader />
			} @else {
				<span class="hidden">{'hidden'}</span>
			}
		</div>
	</ThemeCtx.Provider>
}

// use() inside for-of items — each item reads the same context independently.
export function ListConsumers(props) @{
	<CountCtx.Provider value={props.value}>
		<ul>
			@for (const x of props.items; key x) {
				<li>
					<CountReader />
					<span class="ix">
						{x as string}
					</span>
				</li>
			}
		</ul>
	</CountCtx.Provider>
}

// Context flows through a portal — consumer in the portal target reads
// the Provider that wraps the portal call site.
export function PortalledContext(props) @{
	<ThemeCtx.Provider value="from-portal-parent">
		<div>{createPortal(
			() => @{
				<div class="portal-content">
					<ThemeReader />
				</div>
			},
			props.target,
		)}</div>
	</ThemeCtx.Provider>
}

// Context updates inside a for-of body — changing the value re-renders all rows.
export function LiveCount(props) @{
	const [n, setN] = useState(0);
	<CountCtx.Provider value={n}>
		<div>
			<button id="inc" onClick={() => setN(n + 1)}>
				{n as string}
			</button>
			<ul>
				@for (const x of props.ids; key x) {
					<li>
						<span class="label">
							{'r' + x as string}
						</span>
						<CountReader />
					</li>
				}
			</ul>
		</div>
	</CountCtx.Provider>
}
