import { OctaneNode } from 'octane';

import { useComponentsContext } from '../../../editor/ComponentsContext.js';
import { ColorPickerButton } from './DefaultButtons/ColorPicker.js';
import { SplitButton } from './DefaultButtons/SplitButton.js';

export const TableCellMenu = (props: { children?: OctaneNode }) => {
	const Components = useComponentsContext()!;

	return <Components.Generic.Menu.Dropdown className="bn-menu-dropdown bn-table-handle-menu">
		{props.children ||
			<>
				<SplitButton />
				<ColorPickerButton />
			</>}
	</Components.Generic.Menu.Dropdown>;
};
