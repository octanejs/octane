import { useState } from 'octane';
import { NavigationMenu } from '@octanejs/radix';

// Two-item navigation menu WITH a shared viewport (content is proxied into it via
// ViewportContentMounter) — the flagship arrangement from the Radix docs/tests.
export function NavMenuViewportApp(props?: { defaultValue?: string }) {
	const [selected, setSelected] = useState('none');
	return (
		<div>
			<span data-testid="selected">{selected}</span>
			<NavigationMenu.Root
				data-testid="root"
				delayDuration={100}
				defaultValue={props?.defaultValue}
			>
				<NavigationMenu.List data-testid="list">
					<NavigationMenu.Item value="one">
						<NavigationMenu.Trigger data-testid="trigger-one">Item One</NavigationMenu.Trigger>
						<NavigationMenu.Content data-testid="content-one">
							<NavigationMenu.Link
								data-testid="link-one"
								href="#one"
								onSelect={() => setSelected('one')}
							>
								Content One
							</NavigationMenu.Link>
						</NavigationMenu.Content>
					</NavigationMenu.Item>
					<NavigationMenu.Item value="two">
						<NavigationMenu.Trigger data-testid="trigger-two">Item Two</NavigationMenu.Trigger>
						<NavigationMenu.Content data-testid="content-two">
							<NavigationMenu.Link
								data-testid="link-two"
								href="#two"
								onSelect={() => setSelected('two')}
							>
								Content Two
							</NavigationMenu.Link>
						</NavigationMenu.Content>
					</NavigationMenu.Item>
					<NavigationMenu.Indicator data-testid="indicator" />
				</NavigationMenu.List>
				<NavigationMenu.Viewport data-testid="viewport" />
			</NavigationMenu.Root>
		</div>
	);
}

// Root menu with a nested Sub menu inside item one's content — exercises the
// NavigationMenuSub provider (instant open, its own value state) inline (no viewport).
export function NavMenuSubApp() {
	return (
		<div>
			<NavigationMenu.Root data-testid="root" delayDuration={100}>
				<NavigationMenu.List data-testid="list">
					<NavigationMenu.Item value="one">
						<NavigationMenu.Trigger data-testid="trigger-one">Item One</NavigationMenu.Trigger>
						<NavigationMenu.Content data-testid="content-one">
							<NavigationMenu.Sub data-testid="sub">
								<NavigationMenu.List data-testid="sub-list">
									<NavigationMenu.Item value="sub-one">
										<NavigationMenu.Trigger data-testid="sub-trigger">
											Sub One
										</NavigationMenu.Trigger>
										<NavigationMenu.Content data-testid="sub-content">
											<NavigationMenu.Link data-testid="sub-link" href="#sub-one">
												Sub Content One
											</NavigationMenu.Link>
										</NavigationMenu.Content>
									</NavigationMenu.Item>
								</NavigationMenu.List>
							</NavigationMenu.Sub>
						</NavigationMenu.Content>
					</NavigationMenu.Item>
				</NavigationMenu.List>
			</NavigationMenu.Root>
		</div>
	);
}

// Same menu WITHOUT a viewport — each item's content renders in place (Presence branch).
export function NavMenuInlineApp() {
	const [selected, setSelected] = useState('none');
	return (
		<div>
			<span data-testid="selected">{selected}</span>
			<NavigationMenu.Root data-testid="root" delayDuration={100}>
				<NavigationMenu.List data-testid="list">
					<NavigationMenu.Item value="one">
						<NavigationMenu.Trigger data-testid="trigger-one">Item One</NavigationMenu.Trigger>
						<NavigationMenu.Content data-testid="content-one">
							<NavigationMenu.Link
								data-testid="link-one"
								href="#one"
								onSelect={() => setSelected('one')}
							>
								Content One
							</NavigationMenu.Link>
						</NavigationMenu.Content>
					</NavigationMenu.Item>
					<NavigationMenu.Item value="two">
						<NavigationMenu.Trigger data-testid="trigger-two">Item Two</NavigationMenu.Trigger>
						<NavigationMenu.Content data-testid="content-two">
							<NavigationMenu.Link
								data-testid="link-two"
								href="#two"
								onSelect={() => setSelected('two')}
							>
								Content Two
							</NavigationMenu.Link>
						</NavigationMenu.Content>
					</NavigationMenu.Item>
				</NavigationMenu.List>
			</NavigationMenu.Root>
		</div>
	);
}
