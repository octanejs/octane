/** @jsxImportSource octane */
import { type OctaneNode } from 'octane';
import {
	Autocomplete,
	Combobox,
	Drawer,
	NavigationMenu,
	OTPField,
	ScrollArea,
	Select,
	Toolbar,
	useMediaQuery,
} from '@octanejs/base-ui';
import { type Assert, type Equal } from '../../../../scripts/react-port/type-assertions';

interface Fruit {
	id: string;
	label: string;
}
const fruits: Fruit[] = [{ id: 'pear', label: 'Pear' }];
const selectItems = fruits.map((value) => ({ value, label: value.label }));
const inputRef: { current: HTMLInputElement | null } = { current: null };
const buttonRef: { current: HTMLButtonElement | null } = { current: null };

// Object values and multiple selection keep their payload types through the
// component namespaces, callback details, refs, and renderable children.
<Select.Root
	items={selectItems}
	value={fruits[0]}
	itemToStringLabel={(fruit) => fruit.label}
	onValueChange={(fruit, details) => {
		type Value = Assert<Equal<typeof fruit, Fruit | null>>;
		details.cancel();
	}}
>
	<Select.Trigger ref={buttonRef}>
		<Select.Value>{(fruit: Fruit | null): OctaneNode => fruit?.label}</Select.Value>
	</Select.Trigger>
</Select.Root>;
<Select.Root
	multiple
	items={selectItems}
	value={fruits}
	onValueChange={(value) => {
		type Value = Assert<Equal<typeof value, Fruit[]>>;
	}}
/>;
<Combobox.Root
	items={fruits}
	itemToStringLabel={(fruit) => fruit.label}
	multiple
	value={fruits}
	onValueChange={(value, details) => {
		type Value = Assert<Equal<typeof value, Fruit[]>>;
		details.cancel();
	}}
>
	<Combobox.Input
		ref={inputRef}
		onInput={(event) => {
			event.currentTarget.value satisfies string;
		}}
	/>
</Combobox.Root>;
<Autocomplete.Root
	items={['Apple', 'Pear']}
	onValueChange={(value) => {
		type Value = Assert<Equal<typeof value, string>>;
	}}
>
	<Autocomplete.Input ref={inputRef} />
</Autocomplete.Root>;
<Drawer.Root
	onOpenChange={(open) => {
		type Value = Assert<Equal<typeof open, boolean>>;
	}}
>
	<Drawer.Trigger ref={buttonRef}>Open</Drawer.Trigger>
</Drawer.Root>;
<NavigationMenu.Root>
	<NavigationMenu.List>
		<NavigationMenu.Item value="fruit">
			<NavigationMenu.Trigger ref={buttonRef}>Fruit</NavigationMenu.Trigger>
		</NavigationMenu.Item>
	</NavigationMenu.List>
</NavigationMenu.Root>;
<OTPField.Root
	length={6}
	onValueChange={(value) => {
		type Value = Assert<Equal<typeof value, string>>;
	}}
>
	<OTPField.Input ref={inputRef} />
</OTPField.Root>;
<ScrollArea.Root>
	<ScrollArea.Viewport>
		<ScrollArea.Content>Fruit</ScrollArea.Content>
	</ScrollArea.Viewport>
</ScrollArea.Root>;
<Toolbar.Root orientation="horizontal">
	<Toolbar.Button ref={buttonRef}>Save</Toolbar.Button>
</Toolbar.Root>;

// @ts-expect-error the multiple callback receives an array
<Select.Root<Fruit, true> multiple value={fruits} onValueChange={(value: Fruit) => {}} />;
// @ts-expect-error an input ref cannot attach to the trigger's button
<Select.Trigger ref={inputRef} />;
// @ts-expect-error explicit item types reject a different controlled payload
<Combobox.Root<Fruit> items={fruits} value="pear" />;
// @ts-expect-error OTP length is numeric
<OTPField.Root length="six" />;

// Render-function children must retain contextual parameter types even though
// OctaneNode itself accepts every opaque renderable value.
<Autocomplete.Value>
	{(value) => {
		type Text = Assert<Equal<typeof value, string>>;
		// @ts-expect-error Autocomplete's displayed value is text.
		const invalid: number = value;
		return value.toUpperCase();
	}}
</Autocomplete.Value>;
<Combobox.List>
	{(item, index) => {
		type Index = Assert<Equal<typeof index, number>>;
		// @ts-expect-error The item index is numeric.
		index.toUpperCase();
		return <Combobox.Item value={item}>{String(index)}</Combobox.Item>;
	}}
</Combobox.List>;
<Select.Value>{(value) => String(value)}</Select.Value>;
<Combobox.Value>{(value) => String(value)}</Combobox.Value>;

// Previous barrel surface: root import and a single-argument call.
function previousBarrelMediaQuery(): boolean {
	return useMediaQuery('(min-width: 600px)');
}
type OptionalMediaQueryOptions = undefined extends Parameters<typeof useMediaQuery>[1]
	? true
	: false;
type OptionalMediaQueryOptionsContract = Assert<Equal<OptionalMediaQueryOptions, true>>;
type PreviousBarrelMediaQueryReturn = Assert<
	Equal<ReturnType<typeof previousBarrelMediaQuery>, boolean>
>;
