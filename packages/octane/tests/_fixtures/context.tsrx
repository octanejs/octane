import { useState, createContext, use, useContext, createPortal } from 'octane';
import { ImportedTheme, WithheldChildren } from './imported-context';

// Multiple distinct contexts in one tree.
export const ThemeCtx = createContext('light');
export const UserCtx = createContext('anon');
export const CountCtx = createContext(0);
export const ShadowCtx = createContext('default');

// Reads a single context value.
export function ThemeReader() @{
	const v = use(ThemeCtx);
	<span class="theme">{v as string}</span>
}

export function UserReader() @{
	const v = use(UserCtx);
	<span class="user">{v as string}</span>
}

export function CountReader() @{
	const v = use(CountCtx);
	<span class="count">{v as string}</span>
}

// Reads two contexts in one component.
export function CombinedReader() @{
	const theme = use(ThemeCtx);
	const user = use(UserCtx);
	<span class="combined">{theme + '/' + user as string}</span>
}

// Reads a context that has NO Provider anywhere above it: must resolve to the
// context default on EVERY render. Exercises the resolved-provider cache's
// "cached default" fast path across re-renders — the consumer's first read
// records "no provider", and the invariant (no closer Provider can appear above
// a surviving consumer) means later reads must keep returning the default.
export function BareReader(props) @{
	const v = use(CountCtx);
	<span class="bare">{v + ':' + props.tick as string}</span>
}

// Provider value updates → consumers re-render.
export function DynamicProvider() @{
	const [v, setV] = useState('init');
	<div>
		<button id="swap" onClick={() => setV(v === 'init' ? 'changed' : 'init')}>{'swap'}</button>
		<ThemeCtx value={v}>
			<ThemeReader />
		</ThemeCtx>
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
		<ThemeCtx value={theme}>
			<UserCtx value="alice">
				<CombinedReader />
			</UserCtx>
		</ThemeCtx>
	</div>
}

// A Provider whose children arrive as an IDENTITY-STABLE `{props.children}`
// passthrough: the block is created by StableChildren's ONE-and-only render
// (the value state lives in StableShell, below the block's creation point), so
// every StableShell re-render passes the SAME block into the hole. The
// compiled `{expr}` hole must still dispatch the unchanged renderable to
// childSlot — an inline identity skip would never descend, stranding the
// consumer on the old context value. This is the router-shaped regression: a
// <MemoryRouter> holding location state and forwarding its (stable) children
// through context providers on every navigation.
function StableShell(props) @{
	const [v, setV] = useState('init');
	<div>
		<button id="swap" onClick={() => setV(v === 'init' ? 'changed' : 'init')}>{'swap'}</button>
		<ThemeCtx value={v}>{props.children}</ThemeCtx>
	</div>
}

export function StableChildren() @{
	<StableShell>
		<ThemeReader />
	</StableShell>
}

// A Provider wrapped in an @if: toggling `show` tears down the Provider's scope
// and, on the next show, builds a FRESH one — with a different `value` each time.
// The consumer inside must always read the current Provider's value, never one
// cached from a prior mount. This is the "torn-down/replaced provider scope"
// case that the resolved-provider cache used to guard defensively: locks in that
// a remount never yields a stale context read.
export function RemountingProvider(props) @{
	@if (props.show) {
		<CountCtx value={props.value}>
			<CountReader />
		</CountCtx>
	} @else {
		<span class="off">{'off'}</span>
	}
}

// Multiple sibling consumers all see the same value.
export function Siblings() @{
	<ThemeCtx value="dark">
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
	</ThemeCtx>
}

// Distinct contexts — each consumer reads its own; no leak.
export function TwoContexts() @{
	<ThemeCtx value="dark">
		<UserCtx value="alice">
			<div>
				<ThemeReader />
				<UserReader />
				<CombinedReader />
			</div>
		</UserCtx>
	</ThemeCtx>
}

// use() inside an if-branch — the read happens only when the branch mounts.
export function ConditionalUse(props) @{
	<ThemeCtx value="dark">
		<div>
			@if (props.show) {
				<ThemeReader />
			} @else {
				<span class="hidden">{'hidden'}</span>
			}
		</div>
	</ThemeCtx>
}

// use() inside for-of items — each item reads the same context independently.
export function ListConsumers(props) @{
	<CountCtx value={props.value}>
		<ul>
			@for (const x of props.items; key x) {
				<li>
					<CountReader />
					<span class="ix">{x as string}</span>
				</li>
			}
		</ul>
	</CountCtx>
}

// Context flows through a portal — consumer in the portal target reads
// the Provider that wraps the portal call site.
export function PortalledContext(props) @{
	<ThemeCtx value="from-portal-parent">
		<div>{createPortal(
			() => @{
				<div class="portal-content">
					<ThemeReader />
				</div>
			},
			props.target,
		)}</div>
	</ThemeCtx>
}

// Context updates inside a for-of body — changing the value re-renders all rows.
export function LiveCount(props) @{
	const [n, setN] = useState(0);
	<CountCtx value={n}>
		<div>
			<button id="inc" onClick={() => setN(n + 1)}>{n as string}</button>
			<ul>
				@for (const x of props.ids; key x) {
					<li>
						<span class="label">{'r' + x as string}</span>
						<CountReader />
					</li>
				}
			</ul>
		</div>
	</CountCtx>
}

function useProfileLabel() {
	const theme = use(ThemeCtx);
	const user = use(UserCtx);
	return theme + '/' + user;
}

export function ContextOnlyReader(props: { selected: typeof ThemeCtx | typeof UserCtx }) @{
	const theme = use(ThemeCtx);
	const selected = use(props.selected);
	const profile = useProfileLabel();
	<output class="context-only">{theme + '|' + selected + '|' + profile as string}</output>
}

export function ContextOnlyHost() @{
	const [theme, setTheme] = useState('light');
	const [user, setUser] = useState('alice');
	const [pickTheme, setPickTheme] = useState(false);
	<div>
		<button
			id="change-theme"
			onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
		>{'theme'}</button>
		<button
			id="change-user"
			onClick={() => setUser(user === 'alice' ? 'bob' : 'alice')}
		>{'user'}</button>
		<button id="change-selection" onClick={() => setPickTheme(!pickTheme)}>{'selection'}</button>
		<ThemeCtx value={theme}>
			<UserCtx value={user}>
				<ContextOnlyReader selected={pickTheme ? ThemeCtx : UserCtx} />
			</UserCtx>
		</ThemeCtx>
	</div>
}

function MixedContextPromiseLeaf(props: { load: (key: string) => Promise<string> }) @{
	const detail = use(props.load('detail'));
	<span class="mixed-context-detail">{detail as string}</span>
}

function MixedContextPromiseReader(props: { load: (key: string) => Promise<string> }) @{
	const first = use(props.load('first'));
	const theme = use(ThemeCtx);
	const second = use(props.load('second'));
	<section>
		<p class="mixed-context-promise">{theme + ':' + first + '/' + second as string}</p>
		<MixedContextPromiseLeaf load={props.load} />
	</section>
}

export function MixedContextPromiseHost(props: { load: (key: string) => Promise<string> }) @{
	const [theme, setTheme] = useState('dark');
	<div>
		<button
			id="change-pending-theme"
			onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
		>{'theme'}</button>
		<ThemeCtx value={theme}>
			<>
				@try {
					<MixedContextPromiseReader load={props.load} />
				} @pending {
					<p class="mixed-context-pending">{'loading'}</p>
				}
			</>
		</ThemeCtx>
	</div>
}

function ContextAsyncFirst(props: { load: (key: string) => Promise<string> }) @{
	const value = use(props.load('first'));
	<span class="context-async-first">{value as string}</span>
}

function ContextAsyncSecond(props: { load: (key: string) => Promise<string> }) @{
	const value = use(props.load('second'));
	<span class="context-async-second">{value as string}</span>
}

function ContextOnlyAsyncSiblings(props: { load: (key: string) => Promise<string> }) @{
	const theme = use(ThemeCtx);
	<section class="context-async-siblings" data-theme={theme}>
		<ContextAsyncFirst load={props.load} />
		<ContextAsyncSecond load={props.load} />
	</section>
}

export function ContextOnlyAsyncHost(props: { load: (key: string) => Promise<string> }) @{
	const selectedLoad = props.load;
	<ThemeCtx value="dark">
		<>
			@try {
				<ContextOnlyAsyncSiblings load={selectedLoad} />
			} @pending {
				<p class="context-async-pending">{'loading'}</p>
			}
		</>
	</ThemeCtx>
}

function ShadowedContextPromiseLeaf(props: { load: () => Promise<string> }) @{
	const detail = use(props.load());
	<span class="shadowed-context-detail">{detail as string}</span>
}

export function ShadowedContextPromiseHost(props: {
	gate: Promise<string>;
	load: () => Promise<string>;
}) @{
	<ThemeCtx value="dark">
		<>
			@try {
				const theme = use(ThemeCtx);
				const ShadowCtx = props.gate;
				const value = use(ShadowCtx);
				<section>
					<span class="shadowed-context-result">{theme + ':' + value as string}</span>
					<ShadowedContextPromiseLeaf load={props.load} />
				</section>
			} @pending {
				<span class="shadowed-context-pending">{'loading'}</span>
			}
		</>
	</ThemeCtx>
}

function ImportedThemeReader() @{
	const theme = useContext(ImportedTheme);
	<output class="imported-context-value">{theme as string}</output>
}

export function ImportedContextHost() @{
	const [value, setValue] = useState('dark');
	<ImportedTheme value={value}>
		<div>
			<button class="imported-context-toggle" onClick={() => setValue('light')}>{'theme'}</button>
			<ImportedThemeReader />
		</div>
	</ImportedTheme>
}

function ImportedContextPromiseLeaf(props: { load: () => Promise<string> }) @{
	const detail = use(props.load());
	<span class="imported-context-detail">{detail as string}</span>
}

export function ImportedContextPromiseHost(props: {
	gate: Promise<string>;
	load: () => Promise<string>;
}) @{
	const _$isContext = 'authored';
	<ImportedTheme value="dark">
		<>
			@try {
				const theme = useContext(ImportedTheme);
				const value = use(props.gate);
				<section>
					<span class="imported-context-result">{theme + ':' + value as string}</span>
					<span class="imported-context-authored">{_$isContext as string}</span>
					<ImportedContextPromiseLeaf load={props.load} />
				</section>
			} @pending {
				<span class="imported-context-pending">{'loading'}</span>
			}
		</>
	</ImportedTheme>
}

export function WithheldImportedChildHost(props: {
	gate: Promise<string>;
	load: () => Promise<string>;
}) @{
	@try {
		const value = use(props.gate);
		<>
			<span class="withheld-imported-result">{value as string}</span>
			<WithheldChildren value="ignored">
				<ImportedContextPromiseLeaf load={props.load} />
			</WithheldChildren>
		</>
	} @pending {
		<span class="withheld-imported-pending">{'loading'}</span>
	}
}
