import { Combobox } from '@octanejs/base-ui/combobox';

export interface Person {
	id: string;
	name: string;
}
export const sharedPersonItems = Combobox.createItems([] as Person[], {
	getValue: (person: Person) => person.id,
	getLabel: (person: Person) => person.name,
});
export function CollectionFixture() {
	return <Combobox.Root
		items={sharedPersonItems}
		filteredItems={[
			{ id: 'user-1', name: 'Alice' },
		]}
		defaultValue="user-1"
	>
		<Combobox.Input data-testid="input" />
	</Combobox.Root>;
}
