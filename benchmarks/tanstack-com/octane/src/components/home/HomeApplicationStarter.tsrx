import { Hydrate } from '@octanejs/tanstack-start';
import { idle, visible } from '@octanejs/tanstack-start/hydration';

import { ApplicationStarter } from '~/components/ApplicationStarter.tsrx';
import { HomeApplicationStarterFallback } from './HomeSectionFallbacks.tsrx';

export function HomeApplicationStarter() {
	return <Hydrate
		when={visible({ rootMargin: '180px 0px' })}
		prefetch={idle({ timeout: 3500 })}
		fallback={<HomeApplicationStarterFallback />}
	>
		<ApplicationStarter context="home" enableHotkeys showPromptPreview={false} tone="cyan" />
	</Hydrate>;
}
