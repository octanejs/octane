// Adapted from recharts@3.9.2, commit b3451050c027a23957ffa50a2665c9119df21e47.
/* eslint no-console: 0 */
const isDev = true;

export const warn = (condition: boolean, format: string, ...args: any[]) => {
	if (isDev && typeof console !== 'undefined' && console.warn) {
		if (format === undefined) {
			console.warn('LogUtils requires an error message argument');
		}

		if (!condition) {
			if (format === undefined) {
				console.warn(
					'Minified exception occurred; use the non-minified dev environment ' +
						'for the full error message and additional helpful warnings.',
				);
			} else {
				let argIndex = 0;

				console.warn(format.replace(/%s/g, () => args[argIndex++]));
			}
		}
	}
};
