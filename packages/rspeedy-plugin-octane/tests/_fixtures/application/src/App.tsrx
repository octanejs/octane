import { useEffect } from 'octane';

import badge from './badge.svg';
import { runBackgroundOnlyCallback } from './background-only.js';
import styles from './card.module.css';
import './global.css';

export function App({ label }: { label: string }) @{
	useEffect(() => {
		runBackgroundOnlyCallback();
	}, []);

	<view
		id="milestone-five"
		class={[styles.card, 'application-shell']}
		bindtap={() => runBackgroundOnlyCallback()}
	>
		<image src={badge} />
		<text>
			{label as string}
		</text>
	</view>
}
