import { Button } from '@octanejs/shadcn/Button';
import { createElement, useState } from 'octane';

export function ButtonApp() @{
	const [count, setCount] = useState(0);
	<div>
		<Button id="btn" onClick={() => setCount((c: number) => c + 1)}>{'count:' + count}</Button>
		<Button variant="destructive" size="sm">Delete</Button>
		<Button variant="outline" size="lg" className="w-full">Wide</Button>
		<Button variant="ghost" size="icon" disabled>i</Button>
		<Button variant="link" size="xs">More</Button>
		<Button
			asChild
			variant="secondary"
			size="sm"
			children={createElement('a', { id: 'btn-link', href: '#docs' }, 'Docs')}
		/>
	</div>
}
