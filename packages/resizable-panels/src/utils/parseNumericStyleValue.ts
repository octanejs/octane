export function parseNumericStyleValue(value: number | string | undefined): number | undefined {
	if (value !== undefined) {
		switch (typeof value) {
			case 'number': {
				return value;
			}
			case 'string': {
				if (value.endsWith('px')) {
					return parseFloat(value);
				}
				break;
			}
		}
	}
}
