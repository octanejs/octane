// A settings dashboard assembled from Octane binding packages. Each panel uses
// the components or hooks an application would reach for, so the production
// build compiles a realistic share of each binding's plain `.ts` hook modules.
import { AccountPanel } from './AccountPanel.tsrx';
import { NotificationPanel } from './NotificationPanel.tsrx';
import { PreferencesPanel } from './PreferencesPanel.tsrx';
import { ActivityPanel } from './ActivityPanel.tsrx';
import { HelpTip } from './HelpTip.tsrx';

export function SettingsApp() @{
	<main class="settings">
		<header>
			<h1>{'Settings'}</h1>
			<HelpTip label="Changes save automatically" />
		</header>
		<AccountPanel />
		<NotificationPanel />
		<PreferencesPanel />
		<ActivityPanel />
	</main>
}
