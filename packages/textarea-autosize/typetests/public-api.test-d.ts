import TextareaAutosize, {
	type TextareaAutosizeProps,
	type TextareaHeightChangeMeta,
} from '../src/index.tsrx';

declare function expectType<T>(value: T): void;

const objectRef = { current: null as HTMLTextAreaElement | null };
const callbackRef = function callbackRef(node: HTMLTextAreaElement | null) {
	void node;
};

expectType<typeof TextareaAutosize>(TextareaAutosize);

type Props = TextareaAutosizeProps;
expectType<Props>(null as unknown as Props);

type HeightMeta = TextareaHeightChangeMeta;
expectType<HeightMeta>(null as unknown as HeightMeta);

const props = {
	cacheMeasurements: true,
	maxRows: 8,
	minRows: 2,
	style: { height: 40, width: '20rem' },
	onChange(event: { currentTarget: HTMLTextAreaElement }) {
		event.currentTarget.value satisfies string;
	},
	onHeightChange(height: number, meta: TextareaHeightChangeMeta) {
		height satisfies number;
		meta.rowHeight satisfies number;
	},
} satisfies TextareaAutosizeProps;

expectType<TextareaAutosizeProps>(props);
TextareaAutosize({ ...props, ref: objectRef });
TextareaAutosize({ ...props, ref: callbackRef });
void TextareaAutosize;

// @ts-expect-error minHeight is intentionally excluded in favor of minRows.
const invalidStyle: NonNullable<TextareaAutosizeProps['style']> = { minHeight: 20 };

// @ts-expect-error public ref contract does not accept a ref array.
const invalidRef: TextareaAutosizeProps['ref'] = [objectRef];

void invalidStyle;
void invalidRef;
