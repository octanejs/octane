// Synthetic compiler input for the recording adapter in _valdi-writer.ts.
interface ItemData {
	id: string;
	value: string;
}

interface SceneProps {
	active: boolean;
	extra: Record<string, unknown>;
	tone: string;
	onTap: (value: string) => void;
	items: ItemData[];
}

function Item(props: { item: ItemData; tone: string }) @{
	<label value={props.item.value} tone={props.tone} />
}

export function Scene(props: SceneProps) @{
	<view enabled={true} {...props.extra} tone="final" onTap={props.onTap}>
		@if (props.active) {
			@for (const item of props.items; key item.id) {
				<Item item={item} tone={props.tone} />
			} @empty {
				<label value="empty" />
			}
		} @else {
			<label value="inactive" />
		}
	</view>
}
