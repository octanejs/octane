import type { Element } from 'html-dom-parser';
import { describe, expect, it } from 'vitest';

import type { Props } from '../src/attributes-to-props';
import {
	canTextBeChildOfNode,
	ELEMENTS_WITH_NO_TEXT_CHILDREN,
	isCustomComponent,
	PRESERVE_CUSTOM_ATTRIBUTES,
	returnFirstArg,
	setStyleProp,
} from '../src/utilities';

describe('isCustomComponent', function customComponentSuite() {
	it('returns true if the tag contains a hyphen and is not in the whitelist', function custom() {
		expect(isCustomComponent('my-custom-element')).toBe(true);
	});

	it('returns false if the tag is in the whitelist', function reserved() {
		expect(isCustomComponent('annotation-xml')).toBe(false);
		expect(isCustomComponent('color-profile')).toBe(false);
		expect(isCustomComponent('font-face')).toBe(false);
	});

	it('returns true if the props contains an `is` key', function isProp() {
		expect(isCustomComponent('button', { is: 'custom-button' })).toBe(true);
	});
});

describe('PRESERVE_CUSTOM_ATTRIBUTES', function preserveSuite() {
	it('is true when Octane uses React 16+ custom attribute behavior', function preserves() {
		// OCTANE DIVERGENCE: octane.version is 0.x and does not describe DOM
		// compatibility. Octane preserves custom attributes.
		expect(PRESERVE_CUSTOM_ATTRIBUTES).toBe(true);
	});
});

describe('setStyleProp', function styleSuite() {
	it.each([undefined, null] as unknown as string[])(
		'does not set props.style when style=%p',
		function invalid(style) {
			const props = {};
			expect(setStyleProp(style, props)).toBeUndefined();
			expect(props).toEqual({});
		},
	);

	it('sets props.style', function valid() {
		const style = `
      color: red;
      background-color: #bada55;
      -webkit-user-select: none;
      line-height: 1;
      background-image:
        linear-gradient(to bottom, rgba(255,255,0,0.5), rgba(0,0,255,0.5)),
        url('https://mdn.mozillademos.org/files/7693/catfront.png');
    `;
		const props = { style: { foo: 'bar' }, width: 100 } as unknown as Props;
		expect(setStyleProp(style, props)).toBeUndefined();
		expect(props).toEqual({
			style: {
				WebkitUserSelect: 'none',
				backgroundColor: '#bada55',
				backgroundImage:
					"linear-gradient(to bottom, rgba(255,255,0,0.5), rgba(0,0,255,0.5)),\n        url('https://mdn.mozillademos.org/files/7693/catfront.png')",
				color: 'red',
				lineHeight: '1',
			},
			width: 100,
		});
	});

	it('does not set props.style when style attribute corrupt', function corrupt() {
		const props = {};
		expect(setStyleProp('font - size: 1em', props)).toBeUndefined();
		expect(props).toEqual({ style: {} });
	});
});

describe('canTextBeChildOfNode', function textChildrenSuite() {
	it.each(Array.from(ELEMENTS_WITH_NO_TEXT_CHILDREN))(
		'returns false since text node cannot be child of %s',
		function invalidParent(nodeName) {
			expect(canTextBeChildOfNode({ name: nodeName } as Element)).toBe(false);
		},
	);

	it('returns true if text can be child of <td/>', function validParent() {
		expect(canTextBeChildOfNode({ name: 'td' } as Element)).toBe(true);
	});
});

describe('returnFirstArg', function firstArgSuite() {
	it('returns first argument', function firstArg() {
		expect(returnFirstArg('arg')).toBe('arg');
	});
});
