export function ShadowEditorRows(props: {
	items: readonly { id: string; name: string }[];
	onEditor(host: HTMLDivElement | null): void;
}) @{
	'use dom bindings';
	<>
		@for (const item of props.items; key item.id) {
			<figure data-file={item.id}>
				<div data-editor-id={item.id} data-editor-label={item.name} ref={props.onEditor} />
				<figcaption>{item.name as string}</figcaption>
			</figure>
		}
	</>
}
