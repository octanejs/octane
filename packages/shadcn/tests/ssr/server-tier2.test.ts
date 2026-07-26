import { describe, expect, it } from 'vitest';
import { renderToString } from 'octane/server';
import {
	CheckboxFixture,
	RadioGroupFixture,
	SliderFixture,
	SwitchFixture,
	TabsFixture,
	ToggleFixture,
	ToggleGroupFixture,
} from '../_fixtures/inputs-app.tsrx';
import {
	AccordionFixture,
	AspectRatioFixture,
	CollapsibleFixture,
	ProgressFixture,
} from '../_fixtures/structure-app.tsrx';

// Portal-free Tier-2 components: server-rendered with their contract markers.
// Portal-backed components (dialogs, menus, select, tooltip/popover/hover-card)
// are excluded until the radix binding supports overlay SSR.
const FIXTURES: Array<[string, () => unknown, string[]]> = [
	['Checkbox', CheckboxFixture, ['data-slot="checkbox"', 'role="checkbox"']],
	[
		'RadioGroup',
		RadioGroupFixture,
		['data-slot="radio-group"', 'data-slot="radio-group-item"', 'role="radio"'],
	],
	['Switch', SwitchFixture, ['data-slot="switch"', 'role="switch"', 'data-slot="switch-thumb"']],
	[
		'Slider',
		SliderFixture,
		['data-slot="slider"', 'data-slot="slider-track"', 'data-slot="slider-thumb"'],
	],
	['Tabs', TabsFixture, ['data-slot="tabs"', 'data-slot="tabs-trigger"', 'role="tablist"']],
	['Toggle', ToggleFixture, ['data-slot="toggle"', 'aria-pressed']],
	[
		'ToggleGroup',
		ToggleGroupFixture,
		['data-slot="toggle-group"', 'data-slot="toggle-group-item"'],
	],
	['Accordion', AccordionFixture, ['data-slot="accordion"', 'data-slot="accordion-trigger"']],
	['Collapsible', CollapsibleFixture, ['data-slot="collapsible"']],
	['AspectRatio', AspectRatioFixture, ['data-slot="aspect-ratio"']],
	['Progress', ProgressFixture, ['data-slot="progress"', 'role="progressbar"']],
];

describe('@octanejs/shadcn — server rendering (Tier 2, portal-free)', () => {
	for (const [name, fixture, markers] of FIXTURES) {
		it(`${name} renders on the server with its contract markers`, () => {
			const { html } = renderToString(fixture as any);
			for (const marker of markers) {
				expect(html).toContain(marker);
			}
		});
	}
});
