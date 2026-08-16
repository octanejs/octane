import { createContext } from 'octane/universal/native';

type AnimationContextValue = {
	readonly renderThrottleMs: number;
	readonly subscribe: (
		callback: (currentTime: number) => void,
		interval: number,
	) => {
		readonly startTime: number;
		readonly unsubscribe: () => void;
	};
};

const animationContext = createContext<AnimationContextValue>({
	renderThrottleMs: 0,
	subscribe() {
		return {
			startTime: 0,
			unsubscribe() {},
		};
	},
});

export default animationContext;
