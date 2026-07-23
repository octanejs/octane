/** @jsxImportSource @octanejs/lynx/intrinsics */
import { useState } from 'octane';

export function App() @{
	const [count, setCount] = useState(0);

	<view id="octane-lynx-demo" class="demo-page">
		<view class="hero-card">
			<text class="eyebrow">{'OCTANE + LYNX'}</text>
			<text class="headline">{'Compiled components. Native canvas.'}</text>
			<text
				class="intro"
			>{'This screen is rendered by Octane through the Lynx dual-thread runtime.'}</text>
		</view>

		<view class="counter-card">
			<text class="counter-label">{'NATIVE TAP COUNTER'}</text>
			<text id="octane-demo-count" class="counter-value">{'Count ' + count}</text>
			<view
				id="octane-demo-increment"
				class="increment-button"
				bindtap={() => setCount((value) => value + 1)}
			>
				<text class="increment-label">{'Tap to increment'}</text>
			</view>
		</view>

		<view class="proof-row">
			<view class="proof-pill">
				<text class="proof-label">{'MAIN THREAD FIRST SCREEN'}</text>
			</view>
			<view class="proof-pill">
				<text class="proof-label">{'BACKGROUND STATE'}</text>
			</view>
		</view>
	</view>
}
