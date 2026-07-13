export const mergeClasses = (...classes: (string | undefined)[]): string =>
	classes
		.filter(
			(className, index, array): className is string =>
				Boolean(className) && className!.trim() !== '' && array.indexOf(className) === index,
		)
		.join(' ')
		.trim();

export const hasA11yProp = (props: Record<string, unknown>): boolean => {
	for (const prop in props) {
		if (prop.startsWith('aria-') || prop === 'role' || prop === 'title') return true;
	}
	return false;
};

export const toCamelCase = (string: string): string =>
	string.replace(/^([A-Z])|[\s-_]+(\w)/g, (_match, first, following) =>
		following ? following.toUpperCase() : first.toLowerCase(),
	);

export const toPascalCase = (string: string): string => {
	const camelCase = toCamelCase(string);
	return camelCase.charAt(0).toUpperCase() + camelCase.slice(1);
};

export const toKebabCase = (string: string): string =>
	string.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
