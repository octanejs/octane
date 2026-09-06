import type { StateAttributesMapping } from '../../internals/getStateAttributesProps';
import { collapsibleOpenStateMapping as baseMapping } from '../../utils/collapsibleOpenStateMapping';
import type { CollapsibleRootState } from './CollapsibleRoot.tsrx';
import { transitionStatusMapping } from '../../internals/stateAttributesMapping';

export const collapsibleStateAttributesMapping: StateAttributesMapping<CollapsibleRootState> = {
	...baseMapping,
	...transitionStatusMapping,
};
