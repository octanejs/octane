import { useContext, useState } from 'octane';
import 'octane/signals';
import { Badge, Button, Icon, IconButton, Link, Tooltip } from './primitives.tsrx';
import { searchOpen$, sidebarOpen$, StringsContext, type NavEntry } from './state';

type Style = Record<string, string> | undefined;

export function NavItem(props: { entry: NavEntry; active: boolean; style?: Style }) @{
	const strings = useContext(StringsContext);
	const [hovered, setHovered] = useState(false);
	<li
		class={['nav-item', props.active && 'nav-item-active']}
		style={props.style}
		onPointerEnter={() => setHovered(true)}
		onPointerLeave={() => setHovered(false)}
	>
		<Link href={props.entry.href} class="nav-link">
			<Icon name={props.entry.icon} size={16} />
			<Tooltip label={props.entry.title} side="right">
				<NavLabel title={props.entry.title} active={props.active} />
			</Tooltip>
		</Link>
		@if (props.entry.badge !== null) {
			<Badge value={props.entry.badge} />
		} @else {
			<span class="nav-spacer" />
		}
		@if (props.entry.pinned) {
			<Icon name="pin" size={12} class="nav-pin" />
		} @else {
			<IconButton icon="dots" label={hovered ? strings.options : strings.options} />
		}
	</li>
}

function NavLabel(props: { title: string; active: boolean }) @{
	<span class={['nav-title', props.active && 'nav-title-active']}>{props.title}</span>
}

export function NavSection(props: {
	title: string;
	entries: NavEntry[];
	activeId: string | null;
	collapsible: boolean;
}) @{
	const [collapsed, setCollapsed] = useState(false);
	<section class="nav-section">
		<header class="nav-section-header">
			<h2 class="nav-section-title">{props.title}</h2>
			@if (props.collapsible) {
				<IconButton
					icon={collapsed ? 'chevron-right' : 'chevron-down'}
					label={props.title}
					onClick={() => setCollapsed(!collapsed)}
				/>
			}
		</header>
		@if (!collapsed) {
			<ul class="nav-list">
				@for (const entry of props.entries; key entry.id) {
					<NavItem entry={entry} active={entry.id === props.activeId} />
				}
			</ul>
		}
	</section>
}

function SidebarHeader() @{
	const strings = useContext(StringsContext);
	<div class="sidebar-header">
		<Tooltip label="Home">
			<a href="/" class="logo">
				<Icon name="logo" size={24} />
			</a>
		</Tooltip>
		<div class="sidebar-header-actions">
			<IconButton icon="search" label={strings.search} onClick={() => searchOpen$.set(true)} />
			<IconButton icon="sidebar" label="Close sidebar" onClick={() => sidebarOpen$.set(false)} />
		</div>
	</div>
}

function SidebarShortcuts() @{
	const strings = useContext(StringsContext);
	<nav class="sidebar-shortcuts">
		<Button icon="compose" label={strings.newChat} variant="nav" />
		<Button icon="search" label={strings.search} variant="nav" />
		<Button icon="image" label="Library" variant="nav" />
		<Button icon="code" label="Codex" variant="nav" />
		<Button icon="grid" label="Explore" variant="nav" />
	</nav>
}

function SidebarFooter() @{
	<div class="sidebar-footer">
		<Button icon="sparkle" label="Upgrade plan" variant="upsell">
			<span class="upsell-detail">More access to the best models</span>
		</Button>
		<div class="sidebar-footer-row">
			<IconButton icon="settings" label="Settings" />
			<IconButton icon="help" label="Help" />
			<IconButton icon="download" label="Get the app" />
		</div>
	</div>
}

export function Sidebar(props: {
	projects: NavEntry[];
	history: NavEntry[];
	tools: NavEntry[];
	activeId: string | null;
	liveSections: boolean;
}) @{
	// A section-level native read makes the whole sidebar a reader of the
	// server's adopted value; the default frame keeps its reads in leaves.
	const open = props.liveSections ? sidebarOpen$.get() : true;
	<aside class="sidebar" data-open={open ? 'true' : 'false'}>
		<SidebarHeader />
		@if (open) {
			<div class="sidebar-body">
				<SidebarShortcuts />
				<NavSection title="Projects" entries={props.projects} activeId={null} collapsible={true} />
				<NavSection title="Tools" entries={props.tools} activeId={null} collapsible={true} />
				<NavSection
					title="Chats"
					entries={props.history}
					activeId={props.activeId}
					collapsible={false}
				/>
			</div>
		}
		<SidebarFooter />
	</aside>
}
