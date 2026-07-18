export { act, flushEffects, mount, nextPaint } from '../../octane/tests/_helpers';

/**
 * All CSS the binding's client engine currently holds, read back from its
 * live `<style data-styled>` tag(s). The vitest environment runs with
 * NODE_ENV=test, so DISABLE_SPEEDY selects the TextTag engine and rules are
 * observable as text nodes.
 */
export function getRenderedCSS(): string {
	let css = '';
	const nodes = document.querySelectorAll('style[data-styled]');
	for (let i = 0; i < nodes.length; i++) {
		css += nodes[i].textContent ?? '';
	}
	return css;
}
