import { describe, it, expect } from 'vitest';
import { isReactGrabElement } from '../src/utils/is-react-grab-element.js';
import { isUserIgnoredElement } from '../src/utils/is-user-ignored-element.js';
import { isValidGrabbableElement } from '../src/utils/is-valid-grabbable-element.js';
import { USER_IGNORE_ATTRIBUTE } from '../src/constants.js';

describe('overlay ignore filters', () => {
	it('isReactGrabElement rejects elements inside a grab host', () => {
		const host = document.createElement('div');
		host.setAttribute('data-react-grab', '');
		document.body.appendChild(host);

		const child = document.createElement('span');
		host.appendChild(child);

		expect(isReactGrabElement(host)).toBe(true);
		expect(isReactGrabElement(child)).toBe(false);
		host.remove();
	});

	it('isReactGrabElement rejects demo host attribute', () => {
		const host = document.createElement('div');
		host.setAttribute('data-react-grab-demo', '');
		document.body.appendChild(host);

		expect(isReactGrabElement(host)).toBe(true);
		host.remove();
	});

	it('isUserIgnoredElement rejects elements with USER_IGNORE_ATTRIBUTE', () => {
		const parent = document.createElement('div');
		parent.setAttribute(USER_IGNORE_ATTRIBUTE, '');
		document.body.appendChild(parent);

		const child = document.createElement('span');
		parent.appendChild(child);

		expect(isUserIgnoredElement(parent)).toBe(true);
		expect(isUserIgnoredElement(child)).toBe(true);
		parent.remove();
	});

	it('isUserIgnoredElement allows elements without the attribute', () => {
		const el = document.createElement('div');
		document.body.appendChild(el);
		expect(isUserIgnoredElement(el)).toBe(false);
		el.remove();
	});

	it('isValidGrabbableElement rejects grab host elements', () => {
		const host = document.createElement('div');
		host.setAttribute('data-react-grab', '');
		document.body.appendChild(host);

		expect(isValidGrabbableElement(host)).toBe(false);
		host.remove();
	});

	it('isValidGrabbableElement rejects user-ignored elements', () => {
		const el = document.createElement('div');
		el.setAttribute(USER_IGNORE_ATTRIBUTE, '');
		el.style.width = '100px';
		el.style.height = '100px';
		document.body.appendChild(el);

		expect(isValidGrabbableElement(el)).toBe(false);
		el.remove();
	});
});
