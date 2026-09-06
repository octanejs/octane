/** A public callable component type, followed by JSX using a qualified type. */
export interface Trigger {
	<Payload>(props: { value: Payload }): unknown;
}
export namespace Metadata {
	export interface Row {
		label: string;
	}
}
function Collection<T>(props: { items: T[] }) {
	return <span>{String(props.items.length)}</span>;
}
export function Example() {
	return <Collection<Metadata.Row> items={[{ label: 'item' }]} />;
}
