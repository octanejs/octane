export function NativeListFixture(props) @{
	<list id="native-feed">
		@for (const item of props.items; key item.id) {
			<list-item
				item-key={item.id}
				reuse-identifier="feed-row"
				ref={(handle) => props.captureRef(item.id, handle)}
			>
				<text bindtap={() => props.onTap(item.id)}>
					{item.label as string}
				</text>
			</list-item>
		}
	</list>
}
