import * as React from 'octane';
import { Accordion } from '@octanejs/base-ui/accordion';

export function AccordionRootServerCase1({ PANEL_CONTENT_1 }: { PANEL_CONTENT_1: string }) {
	return <Accordion.Root defaultValue={[0]}>
		<Accordion.Item value={0}>
			<Accordion.Header>
				<Accordion.Trigger>Trigger 1</Accordion.Trigger>
			</Accordion.Header>
			<Accordion.Panel>{PANEL_CONTENT_1}</Accordion.Panel>
		</Accordion.Item>
	</Accordion.Root>;
}
