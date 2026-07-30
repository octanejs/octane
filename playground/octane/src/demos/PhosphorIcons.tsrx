import {
	Bell,
	Camera,
	GithubLogo,
	Heart,
	IconContext,
	MagnifyingGlass,
	Smiley,
} from '@octanejs/phosphor-icons';
import { useState } from 'octane';

const weights = ['thin', 'regular', 'bold', 'fill', 'duotone'] as const;

export function PhosphorIconsDemo() @{
	const [weight, setWeight] = useState<(typeof weights)[number]>('duotone');
	const [mirrored, setMirrored] = useState(false);

	<div>
		<h2 class="demo-title">{'Phosphor Icons on Octane'}</h2>
		<p
			class="demo-blurb"
		>{'Generated, tree-shakeable SVG components with the complete Phosphor weight contract.'}</p>
		<div class="panel row">
			<label>
				{'Weight '}
				<select
					value={weight}
					onChange={(event) => setWeight(event.currentTarget.value as typeof weight)}
				>
					@for (const option of weights; key option) {
						<option value={option}>{option}</option>
					}
				</select>
			</label>
			<label class="row">
				<input
					type="checkbox"
					checked={mirrored}
					onChange={(event) => setMirrored(event.currentTarget.checked)}
				/>
				{'Mirrored'}
			</label>
		</div>
		<IconContext.Provider value={{ size: 42, color: 'currentColor', weight, mirrored }}>
			<div class="phosphor-grid">
				<div>
					<Camera alt="Camera" />
					<span>{'Camera'}</span>
				</div>
				<div>
					<Heart alt="Heart" />
					<span>{'Heart'}</span>
				</div>
				<div>
					<Bell alt="Bell" />
					<span>{'Bell'}</span>
				</div>
				<div>
					<MagnifyingGlass alt="Search" />
					<span>{'Search'}</span>
				</div>
				<div>
					<GithubLogo alt="GitHub" />
					<span>{'GitHub'}</span>
				</div>
				<div>
					<Smiley alt="Smiley" />
					<span>{'Smiley'}</span>
				</div>
			</div>
		</IconContext.Provider>
	</div>
}
