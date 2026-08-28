import Select from '../../src/index';
import type { Ref } from '../../src/components.tsrx';
import type { ActionMeta, InputActionMeta, OnChangeValue, SelectInstance } from '../../src/index';

export type BrowserSelectOption = { label: string; value: string; disabled?: boolean };

export function BrowserSelectFixture(props: {
	autoFocus?: boolean;
	options: readonly BrowserSelectOption[];
	onChange: (value: OnChangeValue<BrowserSelectOption, false>, actionMeta: ActionMeta<
		BrowserSelectOption
	>) => void;
	onInputChange: (value: string, actionMeta: InputActionMeta) => string;
	onMenuClose: () => void;
	onMenuOpen: () => void;
	required?: boolean;
	menuIsOpen?: boolean;
	menuPlacement?: 'auto' | 'bottom' | 'top';
	menuShouldScrollIntoView?: boolean;
	menuShouldBlockScroll?: boolean;
	captureMenuScroll?: boolean;
	onMenuScrollToBottom?: (event: WheelEvent | TouchEvent) => void;
	onMenuScrollToTop?: (event: WheelEvent | TouchEvent) => void;
	ref?: Ref<SelectInstance<BrowserSelectOption, false>>;
}) @{
	<Select
		{...props}
		instanceId="browser"
		name="choice"
		isOptionDisabled={(option) => Boolean(option.disabled)}
	/>
}
