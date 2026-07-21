import { useQuery } from '@octanejs/tanstack-query';

export function Todo(props) @{
	const q = useQuery({ queryKey: ['todo'], queryFn: props.queryFn, retry: false }, props.client);
	<div id="status">{(q.isPending
		? 'pending'
		: q.isError
			? 'error:' + (q.error as Error).message
			: 'data:' + q.data) as string}</div>
}
