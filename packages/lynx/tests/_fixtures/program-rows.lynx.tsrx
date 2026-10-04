export function ProgramRowsFixture(props) @{
	<view id="program-rows">
		@for (const row of props.rows; key row.id) {
			<view class={row.id === props.selected ? 'row danger' : 'row'} id={'row-' + row.id}>
				<text>{row.label as string}</text>
			</view>
		}
	</view>
}
