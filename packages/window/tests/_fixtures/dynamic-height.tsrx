import { useDynamicRowHeight } from '../../src';
import type { DynamicRowHeight } from '../../src';

export let dynamicHeightApi: DynamicRowHeight | null = null;

export function resetDynamicHeightFixture() {
	dynamicHeightApi = null;
}

export function DynamicHeightFixture() @{
	dynamicHeightApi = useDynamicRowHeight({ defaultRowHeight: 20 });
	<div id="dynamic-height-fixture" />
}
