import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import * as tsrxPlugin from '@tsrx/prettier-plugin';
import { format } from 'prettier';

const options = {
	parser: 'tsrx',
	plugins: [tsrxPlugin],
	useTabs: true,
	tabWidth: 2,
	singleQuote: true,
	jsxSingleQuote: false,
	printWidth: 100,
	bracketSameLine: false,
};

async function expectStableFormat(input, expected) {
	const formatted = await format(input, options);
	assert.equal(formatted, expected);
	assert.equal(await format(formatted, options), expected);
}

describe('TSRX Prettier formatting', () => {
	test('formats a return-position self-closing element and Fragment ternary', async () => {
		const input = `function ElementToFragment(condition) {
	return condition ? (
		<Item />
	) : (
		<>
			<Item />
		</>
	);
}
`;
		const expected = `function ElementToFragment(condition) {
	return condition
		? <Item />
		: <>
				<Item />
			</>;
}
`;

		await expectStableFormat(input, expected);
	});

	test('formats a return-position self-closing element and array ternary', async () => {
		const input = `function ElementToArray(condition) {
	return condition ? (
		<Item />
	) : (
		[<Item />]
	);
}
`;
		const expected = `function ElementToArray(condition) {
	return condition ? <Item /> : [<Item />];
}
`;

		await expectStableFormat(input, expected);
	});

	test('formats a multiline parenthesized self-closing JSX expression', async () => {
		const input = `const parenthesized = (
	<Item />
);
`;
		const expected = `const parenthesized = <Item />;
`;

		await expectStableFormat(input, expected);
	});

	test('preserves text after a self-closing child inside a template', async () => {
		const input = `const nested = <div>
	<Item />
	tail
</div>;
`;

		await expectStableFormat(input, input);
	});
});
