/** @jsxImportSource octane */
import { useState } from 'octane';
import { ContextMenuContent, ContextMenuRadioItem } from '@octanejs/shadcn/base-ui/ContextMenu';
import { DropdownMenuContent, DropdownMenuRadioItem } from '@octanejs/shadcn/base-ui/DropdownMenu';
import { MenubarContent, MenubarRadioItem } from '@octanejs/shadcn/base-ui/Menubar';
import { PopoverContent } from '@octanejs/shadcn/base-ui/Popover';
import { HoverCardContent } from '@octanejs/shadcn/base-ui/HoverCard';
import { TooltipContent } from '@octanejs/shadcn/base-ui/Tooltip';
import { TabsTrigger, TabsContent } from '@octanejs/shadcn/base-ui/Tabs';
import { Slider } from '@octanejs/shadcn/base-ui/Slider';

const anchor = { current: document.createElement('button') };
<ContextMenuContent anchor={anchor} collisionPadding={{ top: 8, bottom: 4 }} />;
<DropdownMenuContent anchor={() => anchor.current} side="inline-start" />;
<MenubarContent collisionBoundary={document.body} />;
<PopoverContent anchor={anchor} />;
<HoverCardContent sideOffset={({ anchor: bounds }) => bounds.height} />;
<TooltipContent collisionPadding={8} />;
<ContextMenuRadioItem value="small">Small</ContextMenuRadioItem>;
<DropdownMenuRadioItem value="medium">Medium</DropdownMenuRadioItem>;
<MenubarRadioItem value="large">Large</MenubarRadioItem>;
<TabsTrigger value="profile">Profile</TabsTrigger>;
<TabsContent value="profile">Content</TabsContent>;
<Slider defaultValue={[20, 80]} />;
<Slider
	value={20}
	onValueChange={(value) => {
		const result: number = value;
		void result;
	}}
/>;
<Slider
	defaultValue={[20, 80] as const}
	onValueCommitted={(value) => {
		const result: readonly number[] = value;
		void result;
	}}
/>;

function ControlledSliders() {
	const [range, setRange] = useState([20, 80]);
	const [scalar, setScalar] = useState(20);
	return (
		<>
			<Slider value={range} onValueChange={setRange} onValueCommitted={setRange} />
			<Slider value={scalar} onValueChange={setScalar} onValueCommitted={setScalar} />
		</>
	);
}
void ControlledSliders;

// @ts-expect-error A positioning anchor must resolve to an element or virtual element.
<PopoverContent anchor="button" />;
// @ts-expect-error Collision padding cannot be a CSS string.
<TooltipContent collisionPadding="8px" />;
// @ts-expect-error Radio items require a value.
<ContextMenuRadioItem />;
// @ts-expect-error Radio items require a value.
<DropdownMenuRadioItem />;
// @ts-expect-error Radio items require a value.
<MenubarRadioItem />;
// @ts-expect-error Tabs require a value connecting trigger and panel.
<TabsTrigger />;
// @ts-expect-error Tabs require a value connecting trigger and panel.
<TabsContent />;
// @ts-expect-error Slider values are numeric.
<Slider value="20" />;
// @ts-expect-error A range slider callback receives an array.
<Slider value={[20, 80]} onValueChange={(value: number) => void value} />;
// @ts-expect-error A scalar slider callback receives a number.
<Slider value={20} onValueCommitted={(value: number[]) => void value} />;
