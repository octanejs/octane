import { useContext } from 'octane';
import 'octane/signals';
import { Composer, Suggestions } from './composer.tsrx';
import { Header } from './header.tsrx';
import { Button, Disclosure, Icon, IconButton, Tooltip } from './primitives.tsrx';
import { Sidebar } from './sidebar.tsrx';
import { searchOpen$, StringsContext, type FrameData } from './state';

function Footer() @{
	const strings = useContext(StringsContext);
	<footer class="frame-footer">
		<p class="disclaimer">{strings.disclaimer}</p>
		<nav class="footer-links">
			<a href="/terms">Terms</a>
			<a href="/privacy">Privacy</a>
			<Tooltip label="Cookie preferences">
				<Button label="Cookies" variant="link" />
			</Tooltip>
		</nav>
	</footer>
}

function SearchDialog() @{
	<div class="search-dialog" role="dialog">
		<Icon name="search" />
		<input name="search" placeholder="Search chats" />
		<IconButton icon="close" label="Close" onClick={() => searchOpen$.set(false)} />
	</div>
}

const RAIL = [
	'home',
	'inbox',
	'calendar',
	'files',
	'tasks',
	'notes',
	'agents',
	'apps',
	'library',
	'history',
	'feedback',
	'profile',
	'teams',
	'reports',
	'alerts',
	'labs',
	'store',
	'billing',
	'help',
	'more',
];

function RailButton(props: { index: number }) @{
	<div class="rail-button" data-index={String(props.index)}>
		<IconButton icon={'rail-' + RAIL[props.index]} label={RAIL[props.index]} />
		@if (props.index % 4 === 0) {
			<span class="rail-dot" />
		}
	</div>
}

function RailGroup(props: { start: number }) @{
	<div class="rail-group">
		<RailButton index={props.start} />
		<RailButton index={props.start + 1} />
		<RailButton index={props.start + 2} />
		<RailButton index={props.start + 3} />
	</div>
}

function ActivityRail() @{
	<nav class="activity-rail">
		<RailGroup start={0} />
		<RailGroup start={4} />
		<RailGroup start={8} />
		<RailGroup start={12} />
		<RailGroup start={16} />
	</nav>
}

export function AppFrame(props: {
	data: FrameData;
	activeId: string | null;
	signedIn: boolean;
	liveSections: boolean;
}) @{
	<div class="frame">
		<ActivityRail />
		<Sidebar
			projects={props.data.projects}
			history={props.data.history}
			tools={props.data.tools}
			activeId={props.activeId}
			liveSections={props.liveSections}
		/>
		<main class="frame-main">
			<Header signedIn={props.signedIn} />
			<div class="frame-content">
				<h1 class="frame-title">What can I help with?</h1>
				<Composer toolbarGroups={props.data.toolbarGroups} liveSections={props.liveSections} />
				<Suggestions items={props.data.suggestions} />
				<Disclosure open$={searchOpen$}>
					<SearchDialog />
				</Disclosure>
			</div>
			<Footer />
		</main>
	</div>
}
