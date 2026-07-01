import { Collapsible, Accordion } from '@octanejs/radix';

export function CollapsibleApp() {
	return (
		<Collapsible.Root defaultOpen={false}>
			<Collapsible.Trigger data-testid="trigger">{'toggle'}</Collapsible.Trigger>
			<Collapsible.Content data-testid="content">{'panel'}</Collapsible.Content>
		</Collapsible.Root>
	);
}

export function AccordionSingle() {
	return (
		<Accordion.Root type="single" collapsible defaultValue="a">
			<Accordion.Item value="a">
				<Accordion.Header>
					<Accordion.Trigger data-testid="t-a">{'A'}</Accordion.Trigger>
				</Accordion.Header>
				<Accordion.Content data-testid="c-a">{'panel-a'}</Accordion.Content>
			</Accordion.Item>
			<Accordion.Item value="b">
				<Accordion.Header>
					<Accordion.Trigger data-testid="t-b">{'B'}</Accordion.Trigger>
				</Accordion.Header>
				<Accordion.Content data-testid="c-b">{'panel-b'}</Accordion.Content>
			</Accordion.Item>
		</Accordion.Root>
	);
}

// The scenario createContextScope exists for: a USER's standalone Collapsible provider
// sits BETWEEN Accordion.Item (whose internal Collapsible is accordion-scoped) and the
// Accordion.Trigger/Content. With plain shared context, the user's (closed) Collapsible
// would hijack the Accordion's trigger; with scopes each reads its own context instances.
export function ScopeIsolation() {
	return (
		<Accordion.Root type="single" collapsible defaultValue="a">
			<Accordion.Item value="a">
				<Accordion.Header>
					<Collapsible.Root defaultOpen={false}>
						<Accordion.Trigger data-testid="acc-trigger">{'A'}</Accordion.Trigger>
						<Collapsible.Trigger data-testid="user-trigger">{'user'}</Collapsible.Trigger>
						<Collapsible.Content data-testid="user-content">{'user-panel'}</Collapsible.Content>
					</Collapsible.Root>
				</Accordion.Header>
				<Accordion.Content data-testid="acc-content">{'acc-panel'}</Accordion.Content>
			</Accordion.Item>
		</Accordion.Root>
	);
}

export function AccordionMultiple() {
	return (
		<Accordion.Root type="multiple" defaultValue={['a']}>
			<Accordion.Item value="a">
				<Accordion.Header>
					<Accordion.Trigger data-testid="t-a">{'A'}</Accordion.Trigger>
				</Accordion.Header>
				<Accordion.Content data-testid="c-a">{'panel-a'}</Accordion.Content>
			</Accordion.Item>
			<Accordion.Item value="b">
				<Accordion.Header>
					<Accordion.Trigger data-testid="t-b">{'B'}</Accordion.Trigger>
				</Accordion.Header>
				<Accordion.Content data-testid="c-b">{'panel-b'}</Accordion.Content>
			</Accordion.Item>
		</Accordion.Root>
	);
}
