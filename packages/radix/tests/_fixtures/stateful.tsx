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
