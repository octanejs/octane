import { PollOptions, ReloadOptions, router } from '@inertiajs/core';
import { useEffect, useRef } from 'octane';

const latestSlot = Symbol('Inertia.usePoll.latest');
const pollSlot = Symbol('Inertia.usePoll.poll');
const effectSlot = Symbol('Inertia.usePoll.effect');

export default function usePoll(
	interval: number,
	requestOptions: ReloadOptions | (() => ReloadOptions) | symbol = {},
	options: PollOptions | symbol = {
		keepAlive: false,
		autoStart: true,
	},
) {
	requestOptions = typeof requestOptions === 'symbol' ? {} : requestOptions;
	options =
		typeof options === 'symbol'
			? {
					keepAlive: false,
					autoStart: true,
				}
			: options;
	const latest = useRef(requestOptions, latestSlot);
	latest.current = requestOptions;

	const pollRef = useRef<ReturnType<typeof router.poll> | null>(null, pollSlot);

	useEffect(
		() => {
			pollRef.current = router.poll(
				interval,
				typeof requestOptions === 'function'
					? () => (latest.current as () => ReloadOptions)()
					: requestOptions,
				{ ...options, autoStart: options.autoStart ?? true },
			);

			return () => pollRef.current?.destroy();
		},
		[],
		effectSlot,
	);

	return {
		stop: () => pollRef.current?.stop(),
		start: () => pollRef.current?.start(),
	};
}
