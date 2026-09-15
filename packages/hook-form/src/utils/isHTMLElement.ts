// Adapted from react-hook-form@7.88.0 src/utils/isHTMLElement.ts for Octane.
import isWeb from './isWeb';

export default (value: unknown): value is HTMLElement => {
	if (!isWeb) {
		return false;
	}

	const owner = value ? ((value as HTMLElement).ownerDocument as Document) : 0;
	return (
		value instanceof (owner && owner.defaultView ? owner.defaultView.HTMLElement : HTMLElement)
	);
};
