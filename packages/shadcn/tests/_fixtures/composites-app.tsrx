// Composite fixtures: sidebar + field family compositions exercising the
// props the contract tests assert on.
import { createElement } from 'octane';
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupAction,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarInput,
	SidebarInset,
	SidebarMenu,
	SidebarMenuAction,
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSkeleton,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
	SidebarProvider,
	SidebarRail,
	SidebarSeparator,
	SidebarTrigger,
	useSidebar,
} from '../../src/ui/sidebar.tsrx';
import { TooltipProvider } from '../../src/ui/tooltip.tsrx';
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSeparator,
	FieldSet,
	FieldTitle,
} from '../../src/ui/field.tsrx';

export function SidebarFixture() @{
	<SidebarProvider>
		<Sidebar>
			<SidebarHeader>
				<SidebarInput placeholder="Search" />
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupLabel>Platform</SidebarGroupLabel>
					<SidebarGroupAction data-testid="group-action">+</SidebarGroupAction>
					<SidebarGroupContent>
						<SidebarMenu>
							<SidebarMenuItem>
								<SidebarMenuButton isActive data-testid="menu-button">Home</SidebarMenuButton>
								<SidebarMenuAction showOnHover data-testid="menu-action">a</SidebarMenuAction>
								<SidebarMenuBadge>3</SidebarMenuBadge>
								<SidebarMenuSub>
									<SidebarMenuSubItem>
										<SidebarMenuSubButton href="#sub" data-testid="menu-sub-button">
											Sub
										</SidebarMenuSubButton>
									</SidebarMenuSubItem>
								</SidebarMenuSub>
							</SidebarMenuItem>
							<SidebarMenuItem>
								<SidebarMenuSkeleton showIcon data-testid="menu-skeleton" />
							</SidebarMenuItem>
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
				<SidebarSeparator />
			</SidebarContent>
			<SidebarFooter>footer</SidebarFooter>
			<SidebarRail />
		</Sidebar>
		<SidebarInset>
			<SidebarTrigger data-testid="sidebar-trigger" />
		</SidebarInset>
	</SidebarProvider>
}

export function SidebarVariantFixture() @{
	<SidebarProvider defaultOpen={false}>
		<Sidebar side="right" variant="floating" collapsible="icon">
			<SidebarContent>content</SidebarContent>
		</Sidebar>
	</SidebarProvider>
}

export function SidebarNoneFixture() @{
	<SidebarProvider>
		<Sidebar collapsible="none">
			<SidebarContent>static content</SidebarContent>
		</Sidebar>
	</SidebarProvider>
}

export function SidebarMobileFixture() @{
	<SidebarProvider>
		<Sidebar>
			<SidebarContent>
				<SidebarGroup>Mobile content</SidebarGroup>
			</SidebarContent>
		</Sidebar>
		<SidebarInset>
			<SidebarTrigger data-testid="sidebar-trigger" />
		</SidebarInset>
	</SidebarProvider>
}

function SidebarStateProbe() {
	const { state } = useSidebar();
	return state;
}

export function UseSidebarOutsideFixture() @{
	<SidebarStateProbe />
}

export function SidebarMenuButtonAsChildFixture() {
	return createElement(
		SidebarProvider,
		null,
		createElement(
			SidebarMenuButton,
			{ asChild: true, isActive: true, size: 'lg', 'data-testid': 'aschild-button' },
			createElement('a', { href: '#home' }, 'Home'),
		),
	);
}

export function SidebarMenuButtonTooltipFixture() @{
	<TooltipProvider>
		<SidebarProvider>
			<SidebarMenuButton tooltip="Hover hint" data-testid="tooltip-button">Home</SidebarMenuButton>
		</SidebarProvider>
	</TooltipProvider>
}

export function SidebarMenuButtonTooltipCollapsedFixture() @{
	<TooltipProvider>
		<SidebarProvider defaultOpen={false}>
			<SidebarMenuButton tooltip="Hover hint" data-testid="tooltip-button">Home</SidebarMenuButton>
		</SidebarProvider>
	</TooltipProvider>
}

export function FieldFixture() @{
	<FieldSet>
		<FieldLegend variant="label">Profile</FieldLegend>
		<FieldGroup>
			<Field data-testid="field-vertical">
				<FieldLabel htmlFor="display-name">Name</FieldLabel>
				<FieldDescription>Shown on your profile.</FieldDescription>
			</Field>
			<FieldSeparator data-testid="separator-plain" />
			<Field orientation="horizontal" data-testid="field-horizontal">
				<FieldContent>
					<FieldTitle>Notifications</FieldTitle>
					<FieldDescription>Email me about activity.</FieldDescription>
				</FieldContent>
			</Field>
			<FieldSeparator data-testid="separator-content">or</FieldSeparator>
		</FieldGroup>
	</FieldSet>
}

export function FieldErrorFixture(props: {
	errors?: Array<{ message?: string } | undefined>;
}) @{
	<FieldError data-testid="field-error" errors={props.errors} />
}

export function FieldErrorChildrenFixture() @{
	<FieldError data-testid="field-error" errors={[{ message: 'ignored' }]}>
		Custom error copy
	</FieldError>
}
