import { Select, useSelect } from '@octanejs/drei';

function SelectionCapture(props) @{
	const selected = useSelect();
	props.onSelection(selected.map((object) => object.name));
	null;
}

export function SelectScene(props) @{
	<Select
		multiple={props.multiple}
		box={props.box}
		filter={props.filter}
		onChange={props.onChange}
		onChangePointerUp={props.onChangePointerUp}
	>
		<mesh name="first" />
		<mesh name="second" />
		<SelectionCapture onSelection={props.onSelection} />
	</Select>
}
