import toast, {
	CheckmarkIcon,
	ErrorIcon,
	LoaderIcon,
	resolveValue,
	ToastBar,
	Toaster,
	useToaster,
} from '@octanejs/hot-toast';

// Every toast here outlives the test unless dismissed or removed, and a dismissed
// toast leaves after 30 ms, so each step settles without waiting on real timers.
const stay = { duration: Infinity, removeDelay: 30 };

function Headless() {
	const { toasts, handlers } = useToaster(undefined, 'headless');
	return (
		<section id="headless">
			{toasts.map((t) => (
				<p
					key={t.id}
					{...t.ariaProps}
					data-visible={String(t.visible)}
					data-offset={String(handlers.calculateOffset(t, { gutter: 4 }))}
				>
					{resolveValue(t.message, t)}
				</p>
			))}
		</section>
	);
}

export function HotToastDiff() {
	return (
		<div>
			<button id="blank" onClick={() => toast('Plain message', { id: 'blank', ...stay })}>
				blank
			</button>
			<button id="success" onClick={() => toast.success('Saved', { id: 'success', ...stay })}>
				success
			</button>
			<button
				id="error"
				onClick={() =>
					toast.error('Failed', {
						id: 'error',
						iconTheme: { primary: '#000', secondary: '#fff' },
						...stay,
					})
				}
			>
				error
			</button>
			<button id="loading" onClick={() => toast.loading('Working', { id: 'loading', ...stay })}>
				loading
			</button>
			<button id="resolve" onClick={() => toast.success('Done', { id: 'loading', ...stay })}>
				resolve
			</button>
			<button
				id="emoji"
				onClick={() =>
					toast('With emoji', {
						id: 'emoji',
						icon: '🔥',
						className: 'emoji-toast',
						style: { fontWeight: 600 },
						ariaProps: { role: 'alert', 'aria-live': 'assertive' },
						...stay,
					})
				}
			>
				emoji
			</button>
			<button
				id="element"
				onClick={() =>
					toast((t) => <span className="fn">{'Function ' + t.id}</span>, {
						id: 'element',
						position: 'bottom-left',
						...stay,
					})
				}
			>
				element
			</button>
			<button
				id="custom"
				onClick={() =>
					toast.custom(<div className="custom">Custom</div>, { id: 'custom', ...stay })
				}
			>
				custom
			</button>
			<button
				id="promise"
				onClick={() =>
					toast.promise(
						new Promise<string>((resolve) => setTimeout(() => resolve('ok'), 10)),
						{ loading: 'Loading', success: (value) => 'Got ' + value, error: 'Err' },
						{ id: 'promise', ...stay },
					)
				}
			>
				promise
			</button>
			<button id="dismiss" onClick={() => toast.dismiss('blank')}>
				dismiss
			</button>
			<button id="remove" onClick={() => toast.remove('success')}>
				remove
			</button>
			<button
				id="bar"
				onClick={() => toast.success('In the bar', { id: 'bar-1', toasterId: 'bar', ...stay })}
			>
				bar
			</button>
			<button
				id="headless-add"
				onClick={() =>
					toast('Headless toast', { id: 'headless-1', toasterId: 'headless', ...stay })
				}
			>
				headless
			</button>
			<button id="dismiss-all" onClick={() => toast.dismissAll()}>
				dismiss all
			</button>
			<div id="icons">
				<CheckmarkIcon />
				<ErrorIcon primary="#123456" />
				<LoaderIcon secondary="#abcdef" />
			</div>
			<Toaster
				position="top-right"
				gutter={4}
				toastOptions={{ style: { color: '#111' }, success: { style: { background: '#efe' } } }}
			/>
			<Toaster toasterId="bar" containerClassName="bar-toaster" reverseOrder>
				{(t) => (
					<ToastBar toast={t} position="bottom-center">
						{({ icon, message }) => (
							<>
								{message}
								{icon}
							</>
						)}
					</ToastBar>
				)}
			</Toaster>
			<Headless />
		</div>
	);
}
