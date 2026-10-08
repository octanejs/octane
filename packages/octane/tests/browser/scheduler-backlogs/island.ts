import { createElement as h } from 'octane';
export function Island({ value }: { value: number }) {
	return h(
		'button',
		{
			onClick: (event: Event) => {
				(event.target as HTMLElement).dataset.clicked = 'yes';
			},
		},
		String(value),
	);
}
