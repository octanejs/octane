// React-free delay/pause scheduler adapted from react-spring v10.1.2 packages/core/src/scheduleProps.ts.
export interface ScheduleState {
	paused: boolean;
	pauseQueue: Set<() => void>;
	resumeQueue: Set<() => void>;
}

export function scheduleProps<T>(
	delay: number,
	state: ScheduleState,
	start: () => Promise<T>,
): Promise<T> {
	return new Promise((resolve) => {
		let remaining = Math.max(0, delay);
		let startedAt = Date.now();
		let timer: ReturnType<typeof setTimeout> | undefined;
		const launch = () => {
			state.pauseQueue.delete(pause);
			state.resumeQueue.delete(resume);
			void start().then(resolve);
		};
		const resume = () => {
			startedAt = Date.now();
			timer = setTimeout(launch, remaining);
		};
		const pause = () => {
			if (timer) clearTimeout(timer);
			remaining = Math.max(0, remaining - (Date.now() - startedAt));
		};
		state.pauseQueue.add(pause);
		state.resumeQueue.add(resume);
		if (!state.paused) resume();
	});
}
