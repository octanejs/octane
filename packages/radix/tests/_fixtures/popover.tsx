import { Popover } from '@octanejs/radix';

export function PopoverApp(props?: { modal?: boolean }) {
	return (
		<div data-testid="app">
			<Popover.Root modal={props?.modal}>
				<Popover.Trigger data-testid="trigger">open</Popover.Trigger>
				<Popover.Portal
					children={[
						<Popover.Content key="c" data-testid="content" sideOffset={4}>
							<span data-testid="body">Popover body</span>
							<input data-testid="input" />
							<Popover.Close data-testid="close">close</Popover.Close>
							<Popover.Arrow data-testid="arrow" width={12} height={6} />
						</Popover.Content>,
					]}
				/>
			</Popover.Root>
		</div>
	);
}

export function PopoverWithAnchorApp() {
	return (
		<div data-testid="app">
			<Popover.Root>
				<Popover.Anchor data-testid="anchor">
					<span>anchor here</span>
				</Popover.Anchor>
				<Popover.Trigger data-testid="trigger">open</Popover.Trigger>
				<Popover.Portal
					children={[
						<Popover.Content key="c" data-testid="content">
							Anchored content
						</Popover.Content>,
					]}
				/>
			</Popover.Root>
		</div>
	);
}
