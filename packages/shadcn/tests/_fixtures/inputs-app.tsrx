// Input-control fixtures: one small composition per component family,
// exercising the representative props the contract tests assert on.
import { useState } from 'octane';

import { Checkbox } from '../../src/bases/radix/ui/checkbox.tsrx';
import { RadioGroup, RadioGroupItem } from '../../src/bases/radix/ui/radio-group.tsrx';
import { Switch } from '../../src/bases/radix/ui/switch.tsrx';
import { Slider } from '../../src/bases/radix/ui/slider.tsrx';
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from '../../src/bases/radix/ui/select.tsrx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../src/bases/radix/ui/tabs.tsrx';
import { Toggle } from '../../src/bases/radix/ui/toggle.tsrx';
import { ToggleGroup, ToggleGroupItem } from '../../src/bases/radix/ui/toggle-group.tsrx';

export function CheckboxFixture() @{
	const [checked, setChecked] = useState<boolean | 'indeterminate'>(false);
	const label = String(checked);
	<div>
		<span data-testid="checked">{label as string}</span>
		<Checkbox data-testid="checkbox" className="extra" onCheckedChange={setChecked} />
	</div>
}

export function RadioGroupFixture() @{
	const [value, setValue] = useState('');
	const label =
		value === '' ? 'none' : value;
	<div>
		<span data-testid="value">{label as string}</span>
		<RadioGroup data-testid="group" onValueChange={setValue}>
			<RadioGroupItem data-testid="item-a" value="a" />
			<RadioGroupItem data-testid="item-b" value="b" />
		</RadioGroup>
	</div>
}

export function SwitchFixture() @{
	const [checked, setChecked] = useState(false);
	const label = String(checked);
	<div>
		<span data-testid="checked">{label as string}</span>
		<Switch data-testid="switch" size="sm" onCheckedChange={setChecked} />
	</div>
}

export function SliderFixture() @{
	const [value, setValue] = useState('none');
	const label = value;
	<div>
		<span data-testid="value">{label as string}</span>
		<Slider
			data-testid="slider"
			defaultValue={[30]}
			min={0}
			max={100}
			step={10}
			onValueChange={(v: number[]) => setValue(String(v))}
		/>
	</div>
}

export function RangeSliderFixture() @{
	<Slider data-testid="slider" defaultValue={[20, 80]} min={0} max={100} />
}

export function UnvaluedSliderFixture() @{
	<Slider data-testid="slider" min={5} max={50} />
}

export function SelectFixture(props?: { defaultValue?: string }) @{
	const [value, setValue] = useState(props?.defaultValue ?? '');
	const label =
		value === '' ? 'none' : value;
	<div>
		<span data-testid="value">{label as string}</span>
		<Select defaultValue={props?.defaultValue} onValueChange={(v: string) => setValue(v)}>
			<SelectTrigger data-testid="trigger" size="sm" aria-label="Fruit">
				<SelectValue data-testid="trigger-value" placeholder="Pick a fruit" />
			</SelectTrigger>
			<SelectContent data-testid="content" position="popper">
				<SelectGroup data-testid="group">
					<SelectLabel data-testid="label">Fruits</SelectLabel>
					{/* Keep item text inline: the label text portals into the trigger
    value node verbatim, and tests assert its exact textContent. */}
					<SelectItem data-testid="item-apple" value="apple">Apple</SelectItem>
					<SelectItem data-testid="item-banana" value="banana">Banana</SelectItem>
				</SelectGroup>
				<SelectSeparator data-testid="separator" />
				<SelectItem data-testid="item-cherry" value="cherry">Cherry</SelectItem>
			</SelectContent>
		</Select>
	</div>
}

export function TabsFixture() @{
	<Tabs data-testid="tabs" defaultValue="one">
		<TabsList data-testid="list" variant="line">
			<TabsTrigger data-testid="t-one" value="one">
				One
			</TabsTrigger>
			<TabsTrigger data-testid="t-two" value="two">
				Two
			</TabsTrigger>
		</TabsList>
		<TabsContent data-testid="c-one" value="one">
			First
		</TabsContent>
		<TabsContent data-testid="c-two" value="two">
			Second
		</TabsContent>
	</Tabs>
}

export function ToggleFixture() @{
	const [pressed, setPressed] = useState(false);
	const label = String(pressed);
	<div>
		<span data-testid="pressed">{label as string}</span>
		<Toggle data-testid="toggle" variant="outline" size="sm" onPressedChange={setPressed}>
			B
		</Toggle>
	</div>
}

export function ToggleGroupFixture() @{
	const [value, setValue] = useState('');
	const label =
		value === '' ? 'none' : value;
	<div>
		<span data-testid="value">{label as string}</span>
		<ToggleGroup
			data-testid="group"
			type="single"
			variant="outline"
			size="sm"
			spacing={0}
			onValueChange={(v: string) => setValue(v)}
		>
			<ToggleGroupItem data-testid="item-a" value="a">
				A
			</ToggleGroupItem>
			<ToggleGroupItem data-testid="item-b" value="b">
				B
			</ToggleGroupItem>
		</ToggleGroup>
	</div>
}

export function ToggleGroupMultipleFixture() @{
	<ToggleGroup data-testid="group" type="multiple">
		<ToggleGroupItem data-testid="item-x" value="x">
			X
		</ToggleGroupItem>
		<ToggleGroupItem data-testid="item-y" value="y">
			Y
		</ToggleGroupItem>
	</ToggleGroup>
}

export function VerticalToggleGroupFixture() @{
	<ToggleGroup
		type="single"
		orientation="vertical"
		defaultValue="a"
		aria-label="Vertical"
		data-testid="vgroup"
	>
		<ToggleGroupItem value="a" data-testid="vitem-a">A</ToggleGroupItem>
		<ToggleGroupItem value="b" data-testid="vitem-b">B</ToggleGroupItem>
		<ToggleGroupItem value="c" data-testid="vitem-c">C</ToggleGroupItem>
	</ToggleGroup>
}
