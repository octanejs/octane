const HIDDEN_TEXTAREA_STYLE = {
	'min-height': '0',
	'max-height': 'none',
	height: '0',
	visibility: 'hidden',
	overflow: 'hidden',
	position: 'absolute',
	'z-index': '-1000',
	top: '0',
	right: '0',
	display: 'block',
} as const;

export default function forceHiddenStyles(node: HTMLElement): void {
	Object.keys(HIDDEN_TEXTAREA_STYLE).forEach((key) => {
		node.style.setProperty(
			key,
			HIDDEN_TEXTAREA_STYLE[key as keyof typeof HIDDEN_TEXTAREA_STYLE],
			'important',
		);
	});
}
