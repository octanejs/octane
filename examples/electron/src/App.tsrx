import {
	app,
	clipboard,
	dialog,
	shell,
	useInvoke,
	useInvokeState,
	useIpcEvent,
	useNativeTheme,
	useWindowState,
	windowControls,
} from '@octanejs/electron';
import { useEffect, useState } from 'octane';
import type { BridgeMode } from './bridge';
import type { LogLine, Task, TaskDetail } from './types';

function describeError(error: unknown): string {
	if (typeof error === 'string') return error;
	if (error instanceof Error) return error.message;
	return 'the command failed';
}

function RunPanel(props: { taskId: string; runTask: (id: string) => Promise<void> }) @{
	const [lines, setLines] = useState<LogLine[]>([]);
	const [running, setRunning] = useState(false);
	const [watching, setWatching] = useState(true);
	const [runError, setRunError] = useState('');

	useEffect(() => {
		setLines((current) => (current.length === 0 ? current : []));
		setRunning(false);
		setRunError('');
	}, [props.taskId]);

	useIpcEvent('workbench:log', (...args) => {
		const payload = args[0] as LogLine;
		if (payload.taskId !== props.taskId) return;
		setLines((current) => [...current, payload]);
		if (payload.done) setRunning(false);
	}, { enabled: watching });

	<div class="run">
		<div class="run-controls">
			<button
				type="button"
				onClick={() => {
					setLines([]);
					setRunError('');
					setRunning(true);
					props.runTask(props.taskId).catch((error: unknown) => {
						setRunning(false);
						setRunError(describeError(error));
					});
				}}
			>
				Run task
			</button>
			<button
				type="button"
				aria-pressed={watching ? 'true' : 'false'}
				onClick={() => setWatching((current) => !current)}
			>{(watching ? 'Stop watching log' : 'Watch log') as string}</button>
		</div>
		<p class="run-status" role="status" aria-label="Run status">{(running
			? 'Running'
			: lines.length === 0
				? 'Idle'
				: 'Finished') as string}</p>
		@if (runError !== '') {
			<p class="error" role="alert">{runError as string}</p>
		}
		<ol class="log" aria-label="Task log">
			@for (const line of lines; key line.seq) {
				<li>{line.text as string}</li>
			}
		</ol>
	</div>
}

function TaskFacts(props: { detail: TaskDetail }) @{
	<dl class="facts">
		<dt>Command</dt>
		<dd>{props.detail.command as string}</dd>
		<dt>Working directory</dt>
		<dd>{props.detail.workingDirectory as string}</dd>
		<dt>Last run</dt>
		<dd>{props.detail.lastRun as string}</dd>
		<dt>Average duration</dt>
		<dd>{`${props.detail.averageMs} ms`}</dd>
	</dl>
}

function TaskDetailPane(props: {
	taskId: string;
	runTask: (id: string) => Promise<void>;
}) @{
	const detail = useInvokeState<TaskDetail>('describe_task', { id: props.taskId });

	<div class="detail-body">
		@if (detail.status === 'pending') {
			<p class="status" role="status">Reading the task manifest…</p>
		} @else if (detail.status === 'error') {
			<div class="error" role="alert">
				<p>{describeError(detail.error) as string}</p>
				<button type="button" onClick={() => detail.refetch()}>
					Reload task manifest
				</button>
			</div>
		} @else {
			<div class="detail-loaded">
				<TaskFacts detail={detail.data as TaskDetail} />
				<RunPanel taskId={props.taskId} runTask={props.runTask} />
			</div>
		}
	</div>
}

function TaskList(props: {
	attempt: number;
	selectedId: string;
	onSelect: (id: string) => void;
}) @{
	const tasks = useInvoke<Task[]>('list_tasks', undefined, { deps: [props.attempt] });

	<ul class="task-list">
		@for (const task of tasks; key task.id) {
			<li>
				<button
					type="button"
					aria-pressed={task.id === props.selectedId ? 'true' : 'false'}
					onClick={() => props.onSelect(task.id)}
				>
					<span class="task-name">{task.name as string}</span>
					<span class="task-summary">{task.summary as string}</span>
				</button>
			</li>
		}
	</ul>
}

function HostPanel() @{
	const dark = useNativeTheme();
	const windowState = useWindowState();
	const [version, setVersion] = useState('');
	const [dialogResult, setDialogResult] = useState('');
	const [clipboardValue, setClipboardValue] = useState('');
	const [openedUrl, setOpenedUrl] = useState('');

	<section class="pane" aria-label="Host">
		<h2>Host</h2>
		<dl class="facts" aria-label="Host state">
			<dt>Theme</dt>
			<dd id="host-theme">{(dark ? 'dark' : 'light') as string}</dd>
			<dt>Window title</dt>
			<dd id="host-title">{windowState.title as string}</dd>
			<dt>Maximized</dt>
			<dd id="host-maximized">{(windowState.isMaximized ? 'yes' : 'no') as string}</dd>
		</dl>
		<div class="host-actions">
			<button type="button" onClick={() => void windowControls.maximize()}>
				Maximize window
			</button>
			<button type="button" onClick={() => void windowControls.unmaximize()}>
				Restore window
			</button>
			<button type="button" onClick={() => void windowControls.setTitle('Shell — working')}>
				Set window title
			</button>
			<button
				type="button"
				onClick={() => {
					void app.getVersion().then((next) => setVersion(next));
				}}
			>
				Read app version
			</button>
			<button
				type="button"
				onClick={() => {
					void dialog.showMessageBox({ message: 'hello from shell' }).then((result) => {
						const response = (result as { response?: number }).response ?? -1;
						setDialogResult(`response ${response}`);
					});
				}}
			>
				Show message
			</button>
			<button
				type="button"
				onClick={() => {
					void (async () => {
						await clipboard.writeText('shell-clipboard');
						setClipboardValue(await clipboard.readText());
					})();
				}}
			>
				Round-trip clipboard
			</button>
			<button
				type="button"
				onClick={() => {
					void (async () => {
						await shell.openExternal('https://octanejs.dev');
						setOpenedUrl('https://octanejs.dev');
					})();
				}}
			>
				Open docs
			</button>
		</div>
		<dl class="facts" aria-label="Host action results">
			<dt>App version</dt>
			<dd id="host-version">{(version === '' ? '—' : version) as string}</dd>
			<dt>Dialog</dt>
			<dd id="host-dialog">{(dialogResult === '' ? '—' : dialogResult) as string}</dd>
			<dt>Clipboard</dt>
			<dd id="host-clipboard">{(clipboardValue === '' ? '—' : clipboardValue) as string}</dd>
			<dt>Opened</dt>
			<dd id="host-opened">{(openedUrl === '' ? '—' : openedUrl) as string}</dd>
		</dl>
	</section>
}

export function App(props: {
	mode: BridgeMode;
	runTask: (id: string) => Promise<void>;
}) @{
	const [selectedId, setSelectedId] = useState('');
	const [attempt, setAttempt] = useState(0);

	<main class="workbench">
		<header class="masthead">
			<h1>Electron Shell</h1>
			<p class="mode">{(props.mode === 'electron'
				? 'Electron host'
				: 'Browser preview') as string}</p>
		</header>
		<div class="panes">
			<section class="pane" aria-label="Tasks">
				<h2>Tasks</h2>
				@try {
					<TaskList attempt={attempt} selectedId={selectedId} onSelect={setSelectedId} />
				} @pending {
					<p class="status" role="status">Loading tasks…</p>
				} @catch (error, reset) {
					<div class="error" role="alert">
						<p>{describeError(error) as string}</p>
						<button
							type="button"
							onClick={() => {
								setAttempt((current) => current + 1);
								reset();
							}}
						>
							Retry task list
						</button>
					</div>
				}
			</section>
			<section class="pane" aria-label="Task detail">
				<h2>Detail</h2>
				@if (selectedId === '') {
					<p class="status">Select a task to see how it runs.</p>
				} @else {
					<TaskDetailPane taskId={selectedId} runTask={props.runTask} />
				}
			</section>
		</div>
		<div class="host-row">
			<HostPanel />
		</div>
	</main>
}
