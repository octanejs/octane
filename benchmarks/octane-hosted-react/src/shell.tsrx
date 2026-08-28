import { ReactCompat } from 'octane/react';
import { Counter, type Observation } from './counter.js';

export function Shell(props: { indices: number[]; label: string; observation: Observation }) @{
	<main>
		@for (const index of props.indices; key index) {
			<ReactCompat>
				<Counter index={index} label={props.label} observation={props.observation} />
			</ReactCompat>
		}
	</main>
}
