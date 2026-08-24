// Adapted from recharts@3.9.2, commit b3451050c027a23957ffa50a2665c9119df21e47.
/*
 * @description: convert camel case to dash case
 * string => string
 */
export const getDashCase = (name: string) => name.replace(/([A-Z])/g, (v) => `-${v.toLowerCase()}`);

export const getTransitionVal = (
	props: ReadonlyArray<string>,
	duration: string | number,
	easing: string,
): string => props.map((prop) => `${getDashCase(prop)} ${duration}ms ${easing}`).join(',');
