// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/selection/DOMLayoutDelegate.ts).
// Verbatim (no React surface); RefObject type from @react-types/shared.
import { getItemElement } from './utils';
import type { Key, LayoutDelegate, Rect, RefObject, Size } from '@react-types/shared';

export class DOMLayoutDelegate implements LayoutDelegate {
	private ref: RefObject<HTMLElement | null>;

	constructor(ref: RefObject<HTMLElement | null>) {
		this.ref = ref;
	}

	getItemRect(key: Key): Rect | null {
		let container = this.ref.current;
		if (!container) {
			return null;
		}
		let item = key != null ? getItemElement(this.ref, key) : null;
		if (!item) {
			return null;
		}

		let containerRect = container.getBoundingClientRect();
		let itemRect = item.getBoundingClientRect();

		return {
			x: itemRect.left - containerRect.left - container.clientLeft + container.scrollLeft,
			y: itemRect.top - containerRect.top - container.clientTop + container.scrollTop,
			width: itemRect.width,
			height: itemRect.height,
		};
	}

	getContentSize(): Size {
		let container = this.ref.current;
		return {
			width: container?.scrollWidth ?? 0,
			height: container?.scrollHeight ?? 0,
		};
	}

	getVisibleRect(): Rect {
		let container = this.ref.current;
		return {
			x: container?.scrollLeft ?? 0,
			y: container?.scrollTop ?? 0,
			width: container?.clientWidth ?? 0,
			height: container?.clientHeight ?? 0,
		};
	}
}
