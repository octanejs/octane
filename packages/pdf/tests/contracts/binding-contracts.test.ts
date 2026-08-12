import { describe, expect, it, vi } from 'vitest';

import LinkService from '../../src/LinkService.js';
import { setRef } from '../../src/refs.js';
import { convertDataUriParameterObject, dataURItoBytes } from '../../src/utils.js';

describe('@octanejs/pdf binding contracts', () => {
	it('converts data URI parameter objects without retaining url', function () {
		const dataUri = 'data:text/plain;base64,SGVsbG8sIHdvcmxkIQ==';
		const converted = convertDataUriParameterObject({
			url: dataUri,
			httpHeaders: { Authorization: 'Bearer token' },
		});
		expect(converted).toEqual({
			data: dataURItoBytes(dataUri),
			httpHeaders: { Authorization: 'Bearer token' },
		});
		expect('url' in converted).toBe(false);
	});

	it('sets callback, object, and nested refs', function () {
		const callback = vi.fn();
		const object = { current: null as HTMLDivElement | null };
		const element = {} as HTMLDivElement;
		setRef([callback, [object]], element);
		expect(callback).toHaveBeenCalledWith(element);
		expect(object.current).toBe(element);
		setRef([callback, object], null);
		expect(object.current).toBeNull();
	});

	it('preserves LinkService navigation and external link policy', async function () {
		const scrollPageIntoView = vi.fn();
		const service = new LinkService();
		service.setDocument({
			numPages: 3,
			getDestination: vi.fn(async function () {
				return [1];
			}),
			getPageIndex: vi.fn(async function () {
				return 1;
			}),
		} as never);
		service.setViewer({ scrollPageIntoView });
		service.goToPage(2);
		await service.goToDestination('chapter');
		expect(scrollPageIntoView).toHaveBeenNthCalledWith(1, {
			pageIndex: 1,
			pageNumber: 2,
		});
		expect(scrollPageIntoView).toHaveBeenNthCalledWith(2, {
			dest: [1],
			pageIndex: 1,
			pageNumber: 2,
		});

		const link = document.createElement('a');
		service.addLinkAttributes(link, 'https://octanejs.com/', false);
		expect(link.rel).toBe('noopener noreferrer nofollow');
		service.setExternalLinkRel('noopener');
		service.setExternalLinkTarget('_self');
		service.addLinkAttributes(link, 'https://octanejs.com/', false);
		expect(link.rel).toBe('noopener');
		expect(link.target).toBe('_self');
	});
});
