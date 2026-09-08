import { describe, expect, it } from 'vitest';
import { mount } from '../../octane/tests/_helpers';
import { ScrollAreas } from './_fixtures/scroll-area-styles.tsrx';

describe('ScrollArea stylesheet resources', () => {
	it('shares its global scrollbar stylesheet in the document head', () => {
		const app = mount(ScrollAreas);
		try {
			expect(app.container.querySelector('style')).toBeNull();
			const styles = document.head.querySelectorAll('style[data-href="base-ui-disable-scrollbar"]');
			expect(styles).toHaveLength(1);
			const rule = (styles[0] as HTMLStyleElement).sheet!.cssRules[0] as CSSStyleRule;
			expect(rule.selectorText).toBe('.base-ui-disable-scrollbar');
			expect(rule.style.getPropertyValue('scrollbar-width')).toBe('none');
			expect(styles[0].getAttribute('data-precedence')).toBe('base-ui:low');
			expect(app.container.textContent).toBe('FirstSecond');
		} finally {
			app.unmount();
		}
	});
});
