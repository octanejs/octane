// Grouped, filterable navigation over the demo catalog, built on the vendored
// shadcn Sidebar so the playground dogfoods the components it ships: the rail,
// the mobile Sheet, Cmd/Ctrl+B and the collapse-state cookie all come from it.
//
// It renders whatever `GROUPS` contains and reports selections by id, so adding
// a demo never means touching this file.
import { useState } from 'octane';
import { GROUPS, type Demo, type DemoGroup } from '../catalog';
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarInput,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
	useSidebar,
} from '@octanejs/shadcn/base-ui/Sidebar';

interface DemoNavProps {
	activeId: string;
	onSelect: (id: string) => void;
}

/**
 * Case-insensitive match over the title.
 *
 * Only what is rendered is searchable: matching hidden text makes entries
 * appear for a query the user cannot see anywhere on the row.
 */
function matches(demo: Demo, query: string): boolean {
	const needle = query.trim().toLowerCase();
	if (!needle) return true;
	return demo.title.toLowerCase().includes(needle);
}

/** Groups with their non-matching demos removed, and empty groups dropped. */
function visibleGroups(query: string): DemoGroup[] {
	return GROUPS.map(
		(group) => ({
			...group,
			demos: group.demos.filter((demo) => matches(demo, query)),
		}),
	).filter((group) => group.demos.length > 0);
}

export function DemoNav(props: DemoNavProps) @{
	const [query, setQuery] = useState('');
	const groups = visibleGroups(query);
	// Below the breakpoint the sidebar is a Sheet laid OVER the stage, so a
	// selection that only changes the route leaves the sheet covering the demo it
	// just selected.
	const { isMobile, setOpenMobile } = useSidebar();

	function select(id: string) {
		props.onSelect(id);
		if (isMobile) setOpenMobile(false);
	}

	<Sidebar collapsible="offcanvas">
		<SidebarHeader>
			<SidebarInput
				type="search"
				placeholder="Search demos…"
				aria-label="Search demos"
				value={query}
				onInput={(event: InputEvent) => setQuery((event.target as HTMLInputElement).value)}
			/>
		</SidebarHeader>
		<SidebarContent>
			@for (const group of groups; key group.id) {
				<SidebarGroup>
					<SidebarGroupLabel>{group.label as string}</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							@for (const demo of group.demos; key demo.id) {
								<SidebarMenuItem>
									<SidebarMenuButton
										isActive={demo.id === props.activeId}
										onClick={() => select(demo.id)}
									>
										<span class="demo-nav-title">{demo.title as string}</span>
									</SidebarMenuButton>
								</SidebarMenuItem>
							}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			} @empty {
				<p class="demo-nav-empty">{'No demos match that search.'}</p>
			}
		</SidebarContent>
		<SidebarRail />
	</Sidebar>
}
