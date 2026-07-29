import type { ComponentBody } from 'octane';
import {
	makeAutoObservable,
	observer,
	useLocalObservable,
	type ObserverComponent,
} from '@octanejs/mobx';

type Props = {
	label: string;
	ref?: (node: HTMLButtonElement | null) => void;
};

declare const Component: ComponentBody<Props>;

const Observed: ObserverComponent<Props> = observer(Component);
const acceptsOriginalProps: ComponentBody<Props> = Observed;

const core = makeAutoObservable({ count: 0 });
const count: number = core.count;

const local = useLocalObservable(() => ({ count: 0 }));
const localCount: number = local.count;
