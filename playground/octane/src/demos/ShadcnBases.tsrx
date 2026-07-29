// shadcn/ui across its three primitive bases.
//
// Upstream ships every component against Radix, React Aria, and Base UI, and
// the point of the choice is that it changes the PRIMITIVES, not the design —
// same data-slot names, same aria-nova class strings. Switching tabs here is
// the visual check on that: the two galleries should look like the same design
// system, because they are.
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.tsrx';
import { ShadcnDemo } from './Shadcn.tsrx';
import { ShadcnReactAriaDemo } from './ShadcnReactAria.tsrx';

export function ShadcnBasesDemo() @{
	<div class="space-y-6">
		<Tabs defaultValue="radix">
			<TabsList>
				<TabsTrigger value="radix">Radix</TabsTrigger>
				<TabsTrigger value="react-aria">React Aria</TabsTrigger>
				<TabsTrigger value="base-ui">Base UI</TabsTrigger>
			</TabsList>

			<TabsContent value="radix">
				<ShadcnDemo />
			</TabsContent>

			<TabsContent value="react-aria">
				<ShadcnReactAriaDemo />
			</TabsContent>

			<TabsContent value="base-ui">
				<div class="rounded-lg border border-dashed p-8 text-center">
					<p class="text-sm font-medium">Base UI base not ported yet</p>
					<p class="mt-1 text-sm text-muted-foreground">
						Blocked on six @octanejs/base-ui primitives: collapsible, accordion, tabs, scroll-area,
						select, navigation-menu.
					</p>
				</div>
			</TabsContent>
		</Tabs>
	</div>
}
