// Adapted from recharts@3.9.2, commit b3451050c027a23957ffa50a2665c9119df21e47.
import { NumberDomain } from '../../util/types';

export const numberDomainEqualityCheck = (
	a: NumberDomain | undefined,
	b: NumberDomain | undefined,
): boolean => {
	if (a === b) {
		return true;
	}
	if (a == null || b == null) {
		return false;
	}
	return a[0] === b[0] && a[1] === b[1];
};
