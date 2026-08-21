/** @jsxImportSource @octanejs/ink/intrinsics */
import { Text, useAnimation, useFocus, useInput, usePaste } from '@octanejs/ink';

export function OmittedHookOptionsFixture() @{
	useAnimation();
	useFocus();
	useInput(() => {});
	usePaste(() => {});

	<Text>hooks mounted</Text>
}
