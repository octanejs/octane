import { Tabs, TabsContent, TabsList, TabsTrigger } from '@octanejs/shadcn/Tabs';

export function TabsApp() @{
	<Tabs defaultValue="one">
		<TabsList>
			<TabsTrigger id="t1" value="one">One</TabsTrigger>
			<TabsTrigger id="t2" value="two">Two</TabsTrigger>
		</TabsList>
		<TabsContent value="one">first-panel</TabsContent>
		<TabsContent value="two">second-panel</TabsContent>
	</Tabs>
}
