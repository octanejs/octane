import Loading from '../../src/Loading';
import MonacoContainer from '../../src/MonacoContainer';
import Editor from '../../src/Editor';
import DiffEditor from '../../src/DiffEditor';
import useMonaco from '../../src/hooks/useMonaco';
import type { EditorProps } from '../../src/Editor/types';
import type { DiffEditorProps } from '../../src/DiffEditor/types';
import type { ContainerProps } from '../../src/MonacoContainer/types';
import type { OctaneNode } from 'octane';

export function LoadingFixture(props: { children?: OctaneNode } = {}) @{
	<Loading>{props.children}</Loading>
}

export function MonacoContainerFixture(props: ContainerProps) @{
	<MonacoContainer {...props} />
}

export function EditorFixture(props: EditorProps = {}) @{
	<Editor {...props} />
}

export function DiffEditorFixture(props: DiffEditorProps = {}) @{
	<DiffEditor {...props} />
}

export function UseMonacoProbe() @{
	const monaco = useMonaco();
	<div data-monaco={monaco ? 'ready' : 'pending'}>{(monaco ? 'ready' : 'pending') as string}</div>
}
