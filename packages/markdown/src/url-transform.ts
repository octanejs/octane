const safeProtocol = /^(https?|ircs?|mailto|xmpp)$/i;

/** Preserve react-markdown's pinned default URL allowlist. */
export function defaultUrlTransform(value: string): string {
	const colon = value.indexOf(':');
	const questionMark = value.indexOf('?');
	const numberSign = value.indexOf('#');
	const slash = value.indexOf('/');

	if (
		colon === -1 ||
		(slash !== -1 && colon > slash) ||
		(questionMark !== -1 && colon > questionMark) ||
		(numberSign !== -1 && colon > numberSign) ||
		safeProtocol.test(value.slice(0, colon))
	) {
		return value;
	}

	return '';
}
