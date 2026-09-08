import { ScrollArea } from '@octanejs/base-ui/scroll-area';

export function ScrollAreas() @{
	<>
		<ScrollArea.Root>
			<ScrollArea.Viewport>First</ScrollArea.Viewport>
		</ScrollArea.Root>
		<ScrollArea.Root>
			<ScrollArea.Viewport>Second</ScrollArea.Viewport>
		</ScrollArea.Root>
	</>
}
