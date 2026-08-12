import { afterEach, describe, expect, it } from 'vitest';
import calculateNodeHeight from '../src/calculateNodeHeight.js';
import type { SizingData } from '../src/getSizingData.js';

function sizingData(boxSizing: 'border-box' | 'content-box'): SizingData {
	return {
		borderSize: 2,
		paddingSize: 8,
		sizingStyle: {
			borderBottomWidth: '1px',
			borderLeftWidth: '1px',
			borderRightWidth: '1px',
			borderTopWidth: '1px',
			boxSizing,
			fontFamily: 'Arial',
			fontSize: '16px',
			fontStyle: 'normal',
			fontWeight: '400',
			letterSpacing: '0px',
			lineHeight: '20px',
			paddingBottom: '4px',
			paddingLeft: '4px',
			paddingRight: '4px',
			paddingTop: '4px',
			scrollbarGutter: 'auto',
			tabSize: '8',
			textIndent: '0px',
			textRendering: 'auto',
			textTransform: 'none',
			width: '120px',
			wordBreak: 'normal',
			wordSpacing: '0px',
		},
	};
}

afterEach(() => {
	document.querySelector('textarea[aria-hidden="true"]')?.remove();
});

describe('textarea-autosize measurement', () => {
	it('uses the Firefox-stabilizing second content read for content-box height', () => {
		const reads: string[] = [];
		let contentReads = 0;
		Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
			configurable: true,
			get() {
				const textarea = this as HTMLTextAreaElement;
				reads.push(textarea.value);
				if (textarea.value === 'line one\nline two') {
					contentReads += 1;
					return contentReads === 1 ? 108 : 68;
				}
				return 28;
			},
		});

		expect(calculateNodeHeight(sizingData('content-box'), 'line one\nline two')).toEqual([60, 20]);
		expect(reads).toEqual(['line one\nline two', 'line one\nline two', 'x']);
	});

	it('adds border-box chrome and clamps at maxRows', () => {
		Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
			configurable: true,
			get() {
				return (this as HTMLTextAreaElement).value === 'x' ? 28 : 88;
			},
		});

		expect(calculateNodeHeight(sizingData('border-box'), '1\n2\n3\n4', 1, 2)).toEqual([50, 20]);
	});

	it('applies minRows to empty-content sentinel measurement', () => {
		Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
			configurable: true,
			get() {
				return 28;
			},
		});

		expect(calculateNodeHeight(sizingData('border-box'), 'x', 3)).toEqual([70, 20]);
	});

	it('keeps the hidden textarea inaccessible and reuses one module-global node', () => {
		Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
			configurable: true,
			get() {
				return 28;
			},
		});
		calculateNodeHeight(sizingData('border-box'), 'first');
		const first = document.querySelector('textarea[aria-hidden="true"]');
		calculateNodeHeight(sizingData('border-box'), 'second');

		expect(document.querySelectorAll('textarea[aria-hidden="true"]')).toHaveLength(1);
		expect(document.querySelector('textarea[aria-hidden="true"]')).toBe(first);
		expect(first?.getAttribute('tabindex')).toBe('-1');
		expect((first as HTMLTextAreaElement).style.getPropertyValue('min-height')).toBe('0px');
		expect((first as HTMLTextAreaElement).style.getPropertyPriority('min-height')).toBe(
			'important',
		);
		expect((first as HTMLTextAreaElement).style.getPropertyValue('max-height')).toBe('none');
		expect((first as HTMLTextAreaElement).style.getPropertyValue('z-index')).toBe('-1000');
	});
});
