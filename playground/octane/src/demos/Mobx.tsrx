import { makeAutoObservable, observer } from '@octanejs/mobx';

const store = makeAutoObservable({
	count: 0,
	increment() {
		this.count++;
	},
	decrement() {
		this.count--;
	},
});

function MobxView() @{
	<div>
		<h2 class="demo-title">{'MobX on Octane'}</h2>
		<p
			class="demo-blurb"
		>{'An observable store rerenders an Octane component through the observer binding.'}</p>
		<div class="panel row">
			<button class="btn" onClick={() => store.decrement()}>−</button>
			<strong id="mobx-count">{store.count as string}</strong>
			<button class="btn" onClick={() => store.increment()}>+</button>
		</div>
	</div>
}

export const MobxDemo = observer(MobxView);
