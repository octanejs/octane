import { HoverCard } from '@octanejs/radix';

export function HoverCardApp() {
	return (
		<div data-testid="app">
			<HoverCard.Root openDelay={100} closeDelay={50}>
				<HoverCard.Trigger data-testid="trigger" href="https://example.com">
					@user
				</HoverCard.Trigger>
				<HoverCard.Portal
					children={[
						<HoverCard.Content key="c" data-testid="content" sideOffset={4}>
							<span data-testid="body">Card body</span>
							<a data-testid="link" href="https://example.com/profile">
								profile
							</a>
							<HoverCard.Arrow data-testid="arrow" width={12} height={6} />
						</HoverCard.Content>,
					]}
				/>
			</HoverCard.Root>
		</div>
	);
}
