import { bind } from '@octanejs/rxjs';
import { BehaviorSubject } from 'rxjs';

const counter$ = new BehaviorSubject(0);
const [useCounter] = bind(counter$, 0);

export function RxJSDemo() @{
	const count = useCounter();
	<div>
		<h2 class="demo-title">{'RxJS binding'}</h2>
		<p
			class="demo-blurb"
		>{'A BehaviorSubject rendered through the Octane-native React-RxJS binding.'}</p>
		<div class="row">
			<button class="btn" onClick={() => counter$.next(count + 1)}>{'count: ' +
				count as string}</button>
			<button class="btn" onClick={() => counter$.next(0)}>{'reset'}</button>
		</div>
	</div>
}
