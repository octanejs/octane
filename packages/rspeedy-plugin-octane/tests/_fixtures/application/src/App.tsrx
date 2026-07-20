import badge from './badge.svg';
import styles from './card.module.css';
import './global.css';

export function App({ label }: { label: string }) @{
	<view id="milestone-five" class={[styles.card, 'application-shell']}>
		<image src={badge} />
		<text>
			{label as string}
		</text>
	</view>
}
