import { Hydrate } from '@tanstack/react-start';
import { idle, visible } from '@tanstack/react-start/hydration';

import { ApplicationStarter } from '~/components/ApplicationStarter';
import { HomeApplicationStarterFallback } from './HomeSectionFallbacks';

export function HomeApplicationStarter() {
	return (
		<Hydrate
			when={visible({ rootMargin: '180px 0px' })}
			prefetch={idle({ timeout: 3500 })}
			fallback={<HomeApplicationStarterFallback />}
		>
			<ApplicationStarter context="home" enableHotkeys showPromptPreview={false} tone="cyan" />
		</Hydrate>
	);
}
