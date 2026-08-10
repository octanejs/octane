import { useForm, usePrefetch } from '@octanejs/inertia';

export function ServerHooks() @{
	const prefetch = usePrefetch();
	const form = useForm({ name: 'Ada' });

	<p>{`${prefetch.isPrefetched}:${prefetch.isPrefetching}:${form.data.name}:${form.isDirty}`}</p>
}
