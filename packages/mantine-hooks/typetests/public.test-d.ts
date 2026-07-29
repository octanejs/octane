import {
	useCounter,
	useDisclosure,
	useListState,
	type UseCounterReturnValue,
	type UseDisclosureReturnValue,
	type UseListStateReturnValue,
} from '../src/index';

const counter: UseCounterReturnValue = useCounter(0);
const disclosure: UseDisclosureReturnValue = useDisclosure(false);
const list: UseListStateReturnValue<string> = useListState<string>([]);

counter[1].increment();
disclosure[1].open();
list[1].append('Octane');
