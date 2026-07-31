import { Button, LinkButton } from '@octanejs/shadcn/react-aria/Button';

export function AriaButtonApp() @{
	<div>
		<Button id="plain">Save</Button>
		<Button id="danger" variant="destructive" size="sm">
			Delete
		</Button>
		<LinkButton id="link" href="/next" variant="link">
			Next
		</LinkButton>
	</div>
}
