import { createFileRoute } from '@octanejs/tanstack-router';
import { CustomMessage } from '../components/CustomMessage.tsrx';

export const Route = createFileRoute('/')({
	component: Home,
});

function Home() @{
	<div class="p-2">
		<h3>Welcome Home!!!</h3>
		<CustomMessage message="Hello from a custom component!" />
	</div>
}
