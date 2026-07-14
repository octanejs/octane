import { __DEV__ } from '@apollo/client/utilities/environment';
import { invariant } from '@apollo/client/utilities/invariant';
export function validateSuspenseHookOptions(options) {
	const { fetchPolicy, returnPartialData } = options;
	validateFetchPolicy(fetchPolicy);
	validatePartialDataReturn(fetchPolicy, returnPartialData);
}
function validateFetchPolicy(fetchPolicy = 'cache-first') {
	const supportedFetchPolicies = ['cache-first', 'network-only', 'no-cache', 'cache-and-network'];
	invariant(supportedFetchPolicies.includes(fetchPolicy), 35, fetchPolicy);
}
function validatePartialDataReturn(fetchPolicy, returnPartialData) {
	if (fetchPolicy === 'no-cache' && returnPartialData) {
		__DEV__ && invariant.warn(36);
	}
}
