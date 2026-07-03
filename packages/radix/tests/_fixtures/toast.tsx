import { useState } from 'octane';
import { Toast } from '@octanejs/radix';

// A single toast inside a Provider + Viewport. `announcerContainer` is pointed at an
// in-fixture div so the announce live region ends up inside the test container (the
// default is document.body). Short default duration keeps timer tests fast.

function ToastArea(props: {
	announcer: HTMLElement | null;
	duration?: number;
	withAction?: boolean;
	actionAltText?: string;
	onOpenChange: (open: boolean) => void;
}) {
	return (
		<Toast.Provider
			label="Notification"
			duration={props.duration ?? 50}
			swipeDirection="right"
			announcerContainer={props.announcer ?? undefined}
		>
			<Toast.Root data-testid="toast" defaultOpen onOpenChange={props.onOpenChange}>
				<Toast.Title data-testid="title">Saved!</Toast.Title>
				<Toast.Description data-testid="description">Your changes were saved.</Toast.Description>
				{props.withAction ? (
					<Toast.Action data-testid="action" altText={props.actionAltText ?? 'Undo the save'}>
						Undo
					</Toast.Action>
				) : null}
				<Toast.Close data-testid="close">Dismiss</Toast.Close>
			</Toast.Root>
			<Toast.Viewport data-testid="viewport" />
		</Toast.Provider>
	);
}

export function ToastApp(props?: {
	duration?: number;
	withAction?: boolean;
	actionAltText?: string;
}) {
	const [announcer, setAnnouncer] = useState<HTMLElement | null>(null);
	const [status, setStatus] = useState('open');
	return (
		<div>
			<div data-testid="announcer" ref={setAnnouncer} />
			<span data-testid="status">{status}</span>
			<ToastArea
				announcer={announcer}
				duration={props?.duration}
				withAction={props?.withAction}
				actionAltText={props?.actionAltText}
				onOpenChange={(open: boolean) => setStatus(open ? 'open' : 'closed')}
			/>
		</div>
	);
}
