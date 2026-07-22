import { lazy } from 'octane';

const LazyCard = lazy(() => import('./LazyCard.tsrx'));

export function LazyApp() @{
	<view id="octane-m8-lazy-shell">
		@try {
			<LazyCard label="Native chunk" />
		} @pending {
			<text id="octane-m8-lazy-pending">{'Loading native chunk'}</text>
		} @catch (error) {
			<text id="octane-m8-lazy-error">{String(error)}</text>
		}
	</view>
}
