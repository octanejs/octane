import { useAsync, type AsyncProps } from '../../src/async.tsrx';

export type AsyncOption = { label: string; value: string };
export type AsyncResult = ReturnType<typeof useAsync>;

export function AsyncFixture(props: {
	asyncProps: AsyncProps<AsyncOption, false, never>;
	bind: (result: AsyncResult) => void;
}) @{
	const result = useAsync(props.asyncProps);
	props.bind(result);
	<output data-loading={String(result.isLoading)} data-options={JSON.stringify(result.options)} />
}
