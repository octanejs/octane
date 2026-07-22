import { useEffect } from 'octane';
import { useMainThreadRef } from '@octanejs/lynx';

import badge from './badge.svg';
import { runBackgroundOnlyCallback } from './background-only.js';
import styles from './card.module.css';
import './global.css';

export function App({ label }: { label: string }) @{
	const mainThreadRef = useMainThreadRef();
	const readInBackground = (value: string) => {
		'background only';
		return `octane-m7-background-function:${value}`;
	};
	const onMainThreadTap = () => {
		'main thread';
		return readInBackground(`octane-m7-main-thread-worklet:${mainThreadRef.current !== null}`);
	};

	useEffect(() => {
		runBackgroundOnlyCallback();
	}, []);

	<view
		id="milestone-five"
		class={[styles.card, 'application-shell']}
		bindtap={() => runBackgroundOnlyCallback()}
		main-thread:bindlongpress={onMainThreadTap}
		main-thread:ref={mainThreadRef}
	>
		<image src={badge} />
		<text>{label as string}</text>
	</view>
}
