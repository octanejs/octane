import { HexColorPicker } from '@octanejs/colorful';

interface Picker {
	id: string;
	color: string;
	ref: (node: HTMLDivElement | null) => void;
}

export function PickerList({ pickers }: { pickers: Picker[] }) @{
	<div>
		@for (const picker of pickers; key picker.id) {
			<HexColorPicker data-testid={picker.id} color={picker.color} ref={picker.ref} />
		}
	</div>
}
