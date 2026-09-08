import * as React from 'octane';
import { Collapsible } from '@octanejs/base-ui/collapsible';
import { useIsoLayoutEffect } from '@octanejs/base-ui-utils/useIsoLayoutEffect';

export function CollapsiblePanelServerCase1({ PANEL_CONTENT }: { PANEL_CONTENT: string }) {
	return <React.Fragment>
		<style
			children={`
            @keyframes panel-slide-down {
              from {
                height: 0;
              }

              to {
                height: var(--collapsible-panel-height);
              }
            }

            .animation-test-panel[data-open] {
              animation: panel-slide-down 100ms linear;
            }
          `}
		/>

		<Collapsible.Root defaultOpen>
			<Collapsible.Trigger>Trigger</Collapsible.Trigger>
			<Collapsible.Panel
				className="animation-test-panel"
				data-testid="panel"
			>{PANEL_CONTENT}</Collapsible.Panel>
		</Collapsible.Root>
	</React.Fragment>;
}

export function CollapsiblePanelServerCase2({ PANEL_CONTENT }: { PANEL_CONTENT: string }) {
	return <React.Fragment>
		<style
			children={`
            @keyframes panel-slide-down {
              from {
                height: 0;
              }

              to {
                height: var(--collapsible-panel-height);
              }
            }
          `}
		/>

		<Collapsible.Root defaultOpen>
			<Collapsible.Trigger>Trigger</Collapsible.Trigger>
			<Collapsible.Panel
				data-testid="panel"
				style={{
					animationDuration: '100ms',
					animationName: 'panel-slide-down',
					animationTimingFunction: 'linear',
				}}
			>{PANEL_CONTENT}</Collapsible.Panel>
		</Collapsible.Root>
	</React.Fragment>;
}
