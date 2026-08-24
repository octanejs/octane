import { describe, expect, it } from 'vitest';

import parse from '../../src/index';
import { render } from '../helpers';

describe('trim option', function trimOption() {
	// Per packages/html-react-parser/upstream/__tests__/options/trim.test.ts
	it('preserves whitespace text nodes when disabled if valid in parent (default)', function preserves() {
		const html = `<table>
  <tbody>
    <tr><td>hello</td><td>\n</td><td>&nbsp;</td>\t</tr>\r
  </tbody>
</table>`;
		const reactElement = parse(html);
		expect(render(reactElement)).toBe(
			'<table><tbody><tr><td>hello</td><td>\n</td><td>\u00a0</td></tr></tbody></table>',
		);
	});

	it('removes whitespace text nodes when enabled', function trims() {
		const html = `<table>
      <tbody><tr><td> text </td><td> </td>\t</tr>\r</tbody>\n</table>`;
		const options = { trim: true };
		const reactElement = parse(html, options);
		expect(render(reactElement)).toBe(
			'<table><tbody><tr><td> text </td><td></td></tr></tbody></table>',
		);
	});
});
