/** @jsxImportSource @octanejs/ink/intrinsics */
import { Box, Newline, Text, Transform } from '@octanejs/ink';

export interface BasicFixtureProps {
	readonly name: string;
}

export function BasicFixture(props: BasicFixtureProps) @{
	<Box flexDirection="column" width={20}>
		<Text color="green">
			<Transform transform={(value) => `[${value}]`}>
				Hello{' ' as string}
				{props.name as string}
			</Transform>
		</Text>
		<Text>
			second
			<Newline />
			line
		</Text>
	</Box>
}
