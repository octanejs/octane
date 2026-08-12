import { Example, type ExampleApi, type ExampleProps } from '@octanejs/drei';

const props: ExampleProps = { font: '/font.json', color: 'hotpink', debug: true };
const api: ExampleApi = { incr: (amount = 1) => void amount, decr: (amount = 1) => void amount };
void props;
void api;
void Example;

// @ts-expect-error font is required
const missingFont: ExampleProps = {};
void missingFont;
