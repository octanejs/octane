import { Toaster, toast } from '@octanejs/sonner';
import { useState } from 'octane';

export function SonnerDiff(props: { prefix: string }) {
	const toastId = `${props.prefix}-toast`;
	const [actionCount, setActionCount] = useState(0);
	return <div>
		<button
			id="normal"
			onClick={() => toast('A toast', {
				id: toastId,
				description: 'A description',
				duration: Infinity,
			})}
		>
			Show
		</button>
		<button
			id="update"
			onClick={() => toast.success('Saved', {
				id: toastId,
				description: 'Updated description',
				duration: Infinity,
				closeButton: true,
			})}
		>
			Update
		</button>
		<button
			id="action"
			onClick={() => toast('Action toast', {
				id: `${props.prefix}-action`,
				duration: Infinity,
				action: {
					label: 'Undo',
					onClick: (event) => {
						event.preventDefault();
						setActionCount((count) => count + 1);
					},
				},
			})}
		>
			Action
		</button>
		<span id="action-count">{String(actionCount)}</span>
		<Toaster theme="dark" richColors position="top-right" offset={{ top: 12, right: '2rem' }} />
	</div>;
}
