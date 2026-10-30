import {
	type Context,
	createContext,
	type OctaneNode,
	useContext,
	useEffect,
	useInsertionEffect,
	useState,
} from 'octane';

import {
	getOrCreateWorkerPoolSingleton,
	type SetupWorkerPoolProps,
	terminateWorkerPoolSingleton,
	type WorkerInitializationRenderOptions,
	type WorkerPoolManager,
	type WorkerPoolOptions,
} from '@pierre/diffs/worker';

export type { WorkerPoolOptions, WorkerInitializationRenderOptions };

export const WorkerPoolContext: Context<WorkerPoolManager | undefined> = createContext<
	WorkerPoolManager | undefined
>(undefined);

let instanceCount = 0;

interface WorkerPoolContextProps extends SetupWorkerPoolProps {
	children: OctaneNode;
}

export function WorkerPoolContextProvider({
	children,
	poolOptions,
	highlighterOptions,
}: WorkerPoolContextProps): OctaneNode {
	const [poolManager] = useState(() => {
		if (typeof window === 'undefined') {
			return undefined;
		}
		return getOrCreateWorkerPoolSingleton({
			poolOptions,
			highlighterOptions,
		});
	});
	// We use insertion effect for the instance counting to essentially debounce
	// potentially conflicting mount/unmounts
	useInsertionEffect(() => {
		if (poolManager != null) {
			instanceCount++;
			return () => {
				instanceCount--;
			};
		}
		return undefined;
	}, [poolManager]);
	useEffect(() => {
		return () => {
			if (instanceCount === 0) {
				terminateWorkerPoolSingleton();
			}
		};
	}, []);
	return <WorkerPoolContext value={poolManager}>{children}</WorkerPoolContext>;
}

export function useWorkerPool(): WorkerPoolManager | undefined {
	return useContext(WorkerPoolContext);
}
