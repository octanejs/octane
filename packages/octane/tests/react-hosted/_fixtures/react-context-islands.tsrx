import { memo, use, useContext } from 'octane';
import { HostLocale, HostTheme } from './react-contexts.js';

/**
 * Phase 2 islands: unmodified compiled Octane components reading REAL React
 * contexts through the ordinary `use()`/`useContext()` API — no registration,
 * no props plumbing (react-hosted-octane-compat-plan.md §6.2).
 */

export function HostThemeIsland() @{
	const theme = use(HostTheme);
	<p class="host-theme">
		{'theme:' + String(theme)}
	</p>
}

export function HostThemeViaUseContextIsland() @{
	const theme = useContext(HostTheme);
	<p class="host-theme-uc">
		{'theme:' + String(theme)}
	</p>
}

function MemoHostLeafBody() @{
	const theme = use(HostTheme);
	<p class="memo-host-theme">
		{'memo:' + theme}
	</p>
}

/**
 * memo() consumer with no props: only the mirror's version bump (§6.2 step 9)
 * can push a committed React snapshot past its bailout.
 */
const MemoHostLeaf = memo(MemoHostLeafBody);

export function MemoHostThemeIsland() @{
	<div class="memo-host-shell">
		<MemoHostLeaf />
	</div>
}

/** Logs every body run — observes cross-island isolation (root-local mirrors). */
export function LoggingHostThemeIsland(props) @{
	const theme = use(HostTheme);
	props.log('render:' + props.tag + ':' + theme);
	<p class="logging-host-theme">
		{props.tag + ':' + theme}
	</p>
}

export function TwoHostContextsIsland() @{
	const theme = use(HostTheme);
	const locale = use(HostLocale);
	<p class="two-host">
		{'t:' + theme + ' l:' + locale}
	</p>
}

export function DuplicateReadIsland() @{
	const first = use(HostTheme);
	const second = use(HostTheme);
	<p class="dup-read">
		{first + '/' + second}
	</p>
}

export function ConditionalHostReadIsland(props) @{
	const theme =
		props.read ? use(HostTheme) : '(off)';
	<p class="cond-read">
		{'theme:' + theme as string}
	</p>
}

/** Discovers the React context AND suspends in the same attempt (§6.2 step 7). */
export function ThemeAndResourceIsland(props) @{
	const theme = use(HostTheme);
	const value = use(props.resource);
	<p class="theme-resource">
		{theme + ':' + value as string}
	</p>
}
