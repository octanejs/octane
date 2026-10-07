// Preferences section: Base UI parts with usehooks-ts state helpers.
import { Collapsible, Menu, NumberField, Progress, Select, Toggle } from '@octanejs/base-ui';
import { useBoolean, useDebounceValue, useMap, useStep } from '@octanejs/usehooks-ts';

const THEMES = ['System', 'Light', 'Dark'];

export function PreferencesPanel() @{
	const [step, steps] = useStep(4);
	const compact = useBoolean(false);
	const [pageSize, setPageSize] = useDebounceValue(25, 150);
	const [shortcuts, shortcutActions] = useMap<string, string>([
		['search', '/'],
		['compose', 'c'],
	]);

	<section class="panel">
		<h2>{'Preferences'}</h2>
		<Progress.Root value={step * 25}>
			<Progress.Label>{'Setup ' + step + ' of 4'}</Progress.Label>
			<Progress.Track>
				<Progress.Indicator />
			</Progress.Track>
		</Progress.Root>
		<button onClick={steps.goToPrevStep} disabled={!steps.canGoToPrevStep}>
			{'Back'}
		</button>
		<button onClick={steps.goToNextStep} disabled={!steps.canGoToNextStep}>
			{'Next'}
		</button>
		<Toggle pressed={compact.value} onPressedChange={compact.setValue}>
			{'Compact rows'}
		</Toggle>
		<NumberField.Root
			value={pageSize}
			min={10}
			max={100}
			onValueChange={(value: number | null) => setPageSize(value ?? 25)}
		>
			<NumberField.Group>
				<NumberField.Decrement>{'−'}</NumberField.Decrement>
				<NumberField.Input aria-label="Rows per page" />
				<NumberField.Increment>{'+'}</NumberField.Increment>
			</NumberField.Group>
		</NumberField.Root>
		<Select.Root defaultValue="System">
			<Select.Trigger aria-label="Theme">
				<Select.Value />
				<Select.Icon>{'▾'}</Select.Icon>
			</Select.Trigger>
			<Select.Portal>
				<Select.Positioner>
					<Select.Popup>
						@for (const theme of THEMES; key theme) {
							<Select.Item value={theme}>
								<Select.ItemText>{theme as string}</Select.ItemText>
							</Select.Item>
						}
					</Select.Popup>
				</Select.Positioner>
			</Select.Portal>
		</Select.Root>
		<Collapsible.Root>
			<Collapsible.Trigger>{'Keyboard shortcuts'}</Collapsible.Trigger>
			<Collapsible.Panel>
				<ul>
					@for (const [action, key] of shortcuts; key action) {
						<li>{action + ': ' + key}</li>
					}
				</ul>
			</Collapsible.Panel>
		</Collapsible.Root>
		<Menu.Root>
			<Menu.Trigger>{'Shortcut presets'}</Menu.Trigger>
			<Menu.Portal>
				<Menu.Positioner>
					<Menu.Popup>
						<Menu.Item onClick={() => shortcutActions.set('archive', 'e')}>
							{'Add archive'}
						</Menu.Item>
						<Menu.Item onClick={() => shortcutActions.reset()}>{'Reset'}</Menu.Item>
					</Menu.Popup>
				</Menu.Positioner>
			</Menu.Portal>
		</Menu.Root>
	</section>
}
