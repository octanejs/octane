export default function LazyCard({ label }: { label: string }) @{
	<view id="octane-m8-lazy-chunk">
		<text>{'Loaded: ' + label}</text>
	</view>
}
