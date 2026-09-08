import * as React from 'octane';
import { Accordion } from '@octanejs/base-ui/accordion';

export function AccordionPanelServerCase1({ PANEL_CONTENT }: { PANEL_CONTENT: string }) {
	return <React.Fragment>
		<style
			children={`
            @keyframes panel-slide-down {
              from {
                height: 0;
              }

              to {
                height: var(--accordion-panel-height);
              }
            }
          `}
		/>

		<Accordion.Root defaultValue={[0]}>
			<Accordion.Item value={0}>
				<Accordion.Header>
					<Accordion.Trigger>Trigger</Accordion.Trigger>
				</Accordion.Header>
				<Accordion.Panel
					data-testid="panel"
					style={{
						animationDuration: '100ms',
						animationName: 'panel-slide-down',
						animationTimingFunction: 'linear',
					}}
				>{PANEL_CONTENT}</Accordion.Panel>
			</Accordion.Item>
		</Accordion.Root>
	</React.Fragment>;
}
