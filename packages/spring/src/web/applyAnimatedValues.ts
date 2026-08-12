const customProperty = /^--/;

const unitless = new Set([
	'animationIterationCount',
	'borderImageOutset',
	'borderImageSlice',
	'borderImageWidth',
	'columnCount',
	'columns',
	'flex',
	'flexGrow',
	'flexShrink',
	'fontWeight',
	'gridColumn',
	'gridColumnEnd',
	'gridColumnStart',
	'gridRow',
	'gridRowEnd',
	'gridRowStart',
	'lineClamp',
	'lineHeight',
	'opacity',
	'order',
	'orphans',
	'tabSize',
	'widows',
	'zIndex',
	'zoom',
	'fillOpacity',
	'floodOpacity',
	'stopOpacity',
	'strokeDasharray',
	'strokeDashoffset',
	'strokeMiterlimit',
	'strokeOpacity',
	'strokeWidth',
]);

export function dangerousStyleValue(name: string, value: unknown): string {
	if (value == null || typeof value === 'boolean' || value === '') return '';
	if (
		typeof value === 'number' &&
		value !== 0 &&
		!customProperty.test(name) &&
		!unitless.has(name)
	) {
		return `${value}px`;
	}
	return String(value).trim();
}

export function applyAnimatedValues(instance: any, props: Record<string, any>): boolean {
	if (!instance?.nodeType || !instance.setAttribute || !instance.removeAttribute) return false;
	const {
		className,
		style,
		children: _children,
		scrollTop,
		scrollLeft,
		viewBox,
		ref: _ref,
		...attributes
	} = props;
	for (const name in style ?? {}) {
		const value = dangerousStyleValue(name, style[name]);
		if (customProperty.test(name)) instance.style.setProperty(name, value);
		else instance.style[name] = value;
	}
	for (const originalName in attributes) {
		if (originalName === 'key') continue;
		const value = attributes[originalName];
		// Octane's host component owns event listeners. Re-applying them as DOM
		// attributes would stringify callbacks instead of updating the listener.
		if (typeof value === 'function' || /^on[A-Z]/.test(originalName)) continue;
		const name = instance.hasAttribute(originalName)
			? originalName
			: originalName.replace(/([A-Z])/g, (letter: string) => `-${letter.toLowerCase()}`);
		if (value === undefined) instance.removeAttribute(name);
		else instance.setAttribute(name, String(value));
	}
	if (Object.prototype.hasOwnProperty.call(props, 'className')) {
		if (className === undefined) instance.removeAttribute('class');
		else instance.className = className;
	}
	if (scrollTop !== undefined) instance.scrollTop = scrollTop;
	if (scrollLeft !== undefined) instance.scrollLeft = scrollLeft;
	if (Object.prototype.hasOwnProperty.call(props, 'viewBox')) {
		if (viewBox === undefined) instance.removeAttribute('viewBox');
		else instance.setAttribute('viewBox', viewBox);
	}
	return true;
}
