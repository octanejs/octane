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
import { ShadcnBaseUIDemo } from './ShadcnBaseUI.tsrx';

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
				<ShadcnBaseUIDemo />
			</TabsContent>
		</Tabs>
	</div>
}
