import {
	Separator,
	Label,
	Collapsible,
	Accordion,
	Dialog,
	Toggle,
	ToggleGroup,
	Tabs,
	AspectRatio,
	VisuallyHidden,
	Avatar,
	Progress,
	Toolbar,
	Checkbox,
	Switch,
	RadioGroup,
	Slider,
	Menubar,
	NavigationMenu,
} from '@octanejs/radix';

// Self-contained fixtures for the differential rig: the SAME source runs on octane (via
// @octanejs/radix) AND on React (the setup rewrites the import to the real `radix-ui`
// package), and the rig asserts byte-identical innerHTML after each step. Namespace parts
// are bound to PascalCase consts so both compilers treat them as plain component tags.

const SeparatorRoot = Separator.Root;
const LabelRoot = Label.Root;
const CollapsibleRoot = Collapsible.Root;
const CollapsibleTrigger = Collapsible.Trigger;
const CollapsibleContent = Collapsible.Content;
const AccordionRoot = Accordion.Root;
const AccordionItem = Accordion.Item;
const AccordionHeader = Accordion.Header;
const AccordionTrigger = Accordion.Trigger;
const AccordionContent = Accordion.Content;
const ToggleRoot = Toggle.Root;
const ToggleGroupRoot = ToggleGroup.Root;
const ToggleGroupItem = ToggleGroup.Item;
const TabsRoot = Tabs.Root;
const TabsList = Tabs.List;
const TabsTrigger = Tabs.Trigger;
const TabsContent = Tabs.Content;
const DialogRoot = Dialog.Root;
const DialogTrigger = Dialog.Trigger;
const DialogPortal = Dialog.Portal;
const DialogContent = Dialog.Content;
const DialogTitle = Dialog.Title;
const DialogDescription = Dialog.Description;
const DialogClose = Dialog.Close;

export function Separators() @{
	<div>
		<SeparatorRoot id="h" />
		<SeparatorRoot id="v" orientation="vertical" />
		<SeparatorRoot id="d" decorative />
	</div>
}

export function LabelBasic() @{
	<div>
		<LabelRoot id="lbl" class="field-label">Email</LabelRoot>
	</div>
}

export function CollapsibleApp() @{
	<CollapsibleRoot defaultOpen={false}>
		<CollapsibleTrigger id="trigger">toggle</CollapsibleTrigger>
		<CollapsibleContent id="content">panel</CollapsibleContent>
	</CollapsibleRoot>
}

export function AccordionSingle() @{
	<AccordionRoot type="single" collapsible defaultValue="a">
		<AccordionItem value="a">
			<AccordionHeader>
				<AccordionTrigger id="ta">Alpha</AccordionTrigger>
			</AccordionHeader>
			<AccordionContent id="ca">alpha-panel</AccordionContent>
		</AccordionItem>
		<AccordionItem value="b">
			<AccordionHeader>
				<AccordionTrigger id="tb">Beta</AccordionTrigger>
			</AccordionHeader>
			<AccordionContent id="cb">beta-panel</AccordionContent>
		</AccordionItem>
	</AccordionRoot>
}

// Non-modal so the two side-by-side mounts (octane + React in one document) don't fight
// over focus traps / aria-hidden / body locks — modal specifics are unit-tested. Children
// of DialogPortal are passed as an ARRAY PROP (descriptors) so octane can enumerate them
// per-child, exactly like Radix's Children.map (see Dialog.Portal). `onFocusOutside` is
// prevented because a non-modal dialog dismisses on ANY outside focusin BY DESIGN — and
// each side's open-autofocus is an "outside focus" to the OTHER side's dialog.
export function DialogNonModal() @{
	<div>
		<DialogRoot modal={false}>
			<DialogTrigger id="dt">open</DialogTrigger>
			<DialogPortal
				children={[
					<DialogContent key="c" id="dc" onFocusOutside={(e) => e.preventDefault()}>
						<DialogTitle>Title</DialogTitle>
						<DialogDescription>Description</DialogDescription>
						<DialogClose id="dx">x</DialogClose>
					</DialogContent>,
				]}
			/>
		</DialogRoot>
	</div>
}

export function AccordionMultiple() @{
	<AccordionRoot type="multiple" defaultValue={['a']}>
		<AccordionItem value="a">
			<AccordionHeader>
				<AccordionTrigger id="ta">Alpha</AccordionTrigger>
			</AccordionHeader>
			<AccordionContent id="ca">alpha-panel</AccordionContent>
		</AccordionItem>
		<AccordionItem value="b">
			<AccordionHeader>
				<AccordionTrigger id="tb">Beta</AccordionTrigger>
			</AccordionHeader>
			<AccordionContent id="cb">beta-panel</AccordionContent>
		</AccordionItem>
	</AccordionRoot>
}

export function ToggleApp() @{
	<div>
		<ToggleRoot id="t">bold</ToggleRoot>
	</div>
}

export function ToggleGroupSingle() @{
	<div>
		<ToggleGroupRoot type="single" defaultValue="a">
			<ToggleGroupItem id="ga" value="a">A</ToggleGroupItem>
			<ToggleGroupItem id="gb" value="b">B</ToggleGroupItem>
		</ToggleGroupRoot>
	</div>
}

export function ToggleGroupMultiple() @{
	<div>
		<ToggleGroupRoot type="multiple" defaultValue={['a']}>
			<ToggleGroupItem id="ga" value="a">A</ToggleGroupItem>
			<ToggleGroupItem id="gb" value="b">B</ToggleGroupItem>
		</ToggleGroupRoot>
	</div>
}

export function TabsApp() @{
	<TabsRoot defaultValue="one">
		<TabsList>
			<TabsTrigger id="t1" value="one">One</TabsTrigger>
			<TabsTrigger id="t2" value="two">Two</TabsTrigger>
		</TabsList>
		<TabsContent value="one">panel-one</TabsContent>
		<TabsContent value="two">panel-two</TabsContent>
	</TabsRoot>
}

const AspectRatioRoot = AspectRatio.Root;
// Hoisted: the TSRX attribute parser mis-lexes `/` inside `ratio={WIDESCREEN}`.
const WIDESCREEN = 16 / 9;
const VisuallyHiddenRoot = VisuallyHidden.Root;
const AvatarRoot = Avatar.Root;
const AvatarImage = Avatar.Image;
const AvatarFallback = Avatar.Fallback;
const ProgressRoot = Progress.Root;
const ProgressIndicator = Progress.Indicator;
const ToolbarRoot = Toolbar.Root;
const ToolbarButton = Toolbar.Button;
const ToolbarLink = Toolbar.Link;
const ToolbarSeparator = Toolbar.Separator;
const ToolbarToggleGroup = Toolbar.ToggleGroup;
const ToolbarToggleItem = Toolbar.ToggleItem;

export function QuickWins() @{
	<div>
		<AspectRatioRoot ratio={WIDESCREEN}>
			<div id="ar-content">content</div>
		</AspectRatioRoot>
		<VisuallyHiddenRoot id="vh">hidden text</VisuallyHiddenRoot>
		<AvatarRoot id="av">
			<AvatarImage src="https://example.com/x.png" alt="" />
			<AvatarFallback id="av-fb">AB</AvatarFallback>
		</AvatarRoot>
		<ProgressRoot id="pg" value={30}>
			<ProgressIndicator id="pg-i" />
		</ProgressRoot>
		<ProgressRoot id="pg2" />
	</div>
}

export function ToolbarApp() @{
	<div>
		<ToolbarRoot id="tb">
			<ToolbarButton id="b1">One</ToolbarButton>
			<ToolbarSeparator id="sep" />
			<ToolbarLink id="lnk" href="#">Link</ToolbarLink>
			<ToolbarToggleGroup type="multiple" defaultValue={['b']}>
				<ToolbarToggleItem id="ti-a" value="a">A</ToolbarToggleItem>
				<ToolbarToggleItem id="ti-b" value="b">B</ToolbarToggleItem>
			</ToolbarToggleGroup>
		</ToolbarRoot>
	</div>
}

const CheckboxRoot = Checkbox.Root;
const CheckboxIndicator = Checkbox.Indicator;
const SwitchRoot = Switch.Root;
const SwitchThumb = Switch.Thumb;
const RadioGroupRoot = RadioGroup.Root;
const RadioGroupItem = RadioGroup.Item;
const RadioGroupIndicator = RadioGroup.Indicator;
const SliderRoot = Slider.Root;
const SliderTrack = Slider.Track;
const SliderRange = Slider.Range;
const SliderThumb = Slider.Thumb;

// Form controls INSIDE a real <form> so the hidden bubble inputs render on both sides.
export function FormControls() @{
	<form>
		<CheckboxRoot id="cb" name="notify">
			<CheckboxIndicator id="cb-i">x</CheckboxIndicator>
		</CheckboxRoot>
		<SwitchRoot id="sw" name="airplane">
			<SwitchThumb id="sw-t" />
		</SwitchRoot>
		<RadioGroupRoot id="rg" name="flavor">
			<RadioGroupItem id="rg-a" value="vanilla">
				<RadioGroupIndicator id="rg-a-i" />
			</RadioGroupItem>
			<RadioGroupItem id="rg-b" value="chocolate">
				<RadioGroupIndicator id="rg-b-i" />
			</RadioGroupItem>
		</RadioGroupRoot>
	</form>
}

const SLIDER_DEFAULTS = [30];

export function SliderDiff() @{
	<form>
		<SliderRoot id="sl" name="volume" min={0} max={100} step={10} defaultValue={SLIDER_DEFAULTS}>
			<SliderTrack id="sl-t">
				<SliderRange id="sl-r" />
			</SliderTrack>
			<SliderThumb id="sl-th" />
		</SliderRoot>
	</form>
}

const MenubarRoot = Menubar.Root;
const MenubarMenu = Menubar.Menu;
const MenubarTrigger = Menubar.Trigger;
const NavigationMenuRoot = NavigationMenu.Root;
const NavigationMenuList = NavigationMenu.List;
const NavigationMenuItem = NavigationMenu.Item;
const NavigationMenuTrigger = NavigationMenu.Trigger;
const NavigationMenuLink = NavigationMenu.Link;

// Closed-state byte parity for the two new container-visible components (their open
// content portals / needs pointer timing, covered by unit suites).
export function MenubarClosed() @{
	<div>
		<MenubarRoot id="mb">
			<MenubarMenu value="file">
				<MenubarTrigger id="mb-file">File</MenubarTrigger>
			</MenubarMenu>
			<MenubarMenu value="edit">
				<MenubarTrigger id="mb-edit">Edit</MenubarTrigger>
			</MenubarMenu>
		</MenubarRoot>
	</div>
}

export function NavMenuClosed() @{
	<div>
		<NavigationMenuRoot id="nm">
			<NavigationMenuList id="nm-list">
				<NavigationMenuItem value="one">
					<NavigationMenuTrigger id="nm-t1">One</NavigationMenuTrigger>
				</NavigationMenuItem>
				<NavigationMenuItem value="two">
					<NavigationMenuLink id="nm-l" href="#">Two</NavigationMenuLink>
				</NavigationMenuItem>
			</NavigationMenuList>
		</NavigationMenuRoot>
	</div>
}
