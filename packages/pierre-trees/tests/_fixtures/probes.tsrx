// Octane probes for the differential lane. tests/differential/parity.test.ts
// builds the same components over the published @pierre/trees/react; each
// renders its hook's value as text and reports what a caller would hold on to.
import type { FileTree as FileTreeModel } from '@pierre/trees';
import {
	FileTree,
	type FileTreeSelector,
	type FileTreeSelectorEquality,
	useFileTreeSearch,
	useFileTreeSelector,
} from '../../src/index.ts';

type Report = (value: unknown) => void;

export function SelectorProbe(props: {
	model: FileTreeModel;
	selector: FileTreeSelector<unknown>;
	isEqual?: FileTreeSelectorEquality<unknown>;
	report: Report;
}) @{
	const value = useFileTreeSelector(props.model, props.selector, props.isEqual);
	props.report(value);
	<span>{JSON.stringify(value) as string}</span>
}

export function SearchProbe(props: { model: FileTreeModel; report: Report }) @{
	const search = useFileTreeSearch(props.model);
	props.report(search);
	<>
		<output>
			{
				JSON.stringify({
					isOpen: search.isOpen,
					matchingPaths: search.matchingPaths,
					value: search.value,
				}) as string
			}
		</output>
		<FileTree model={props.model} />
	</>
}
