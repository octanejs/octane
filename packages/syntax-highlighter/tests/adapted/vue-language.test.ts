import { expect, test, vi } from 'vitest';
import * as React from 'octane';
import renderer from '../react-test-renderer-adapter.ts';
import SyntaxHighlighter from '../../src';
const code = `<script lang="ts" setup>
import { Layout } from "@ui/libs";
<\/script>

<template>
    <Layout />
</template>
`;
test('SyntaxHighlighter component renders vue', () => {
	const tree = renderer
		.create(/* @__PURE__ */ React.createElement(SyntaxHighlighter, { language: 'vue' }, code))
		.toJSON();
	expect(tree).toMatchSnapshot();
});
