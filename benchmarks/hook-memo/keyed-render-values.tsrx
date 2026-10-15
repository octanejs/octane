'use strong';

import { Fragment } from 'octane';
import { KeyedChild } from './render-values.tsrx';

type Props = { id: string; label: string; spread: { label: string; key: string } };

export function KeyedFragment(props: Props) @{
	<Fragment key={props.id}>
		<input defaultValue="draft" />
		<span>{props.label as string}</span>
	</Fragment>
}

export function KeyedScopedFragment(props: Props) @{
	<Fragment key={props.id}>@{
		const label = props.label;
		<div>
			<input defaultValue="draft" />
			<span>{label as string}</span>
		</div>
	}</Fragment>
}

export function KeyedTryFragment(props: Props) @{
	<Fragment key={props.id}>
		@try {
			<div>
				<input defaultValue="draft" />
				<span>{props.label as string}</span>
			</div>
		} @pending {
			<p>Pending</p>
		} @catch {
			<p>Failed</p>
		}
	</Fragment>
}

export function KeyBeforeSpread(props: Props) @{
	<KeyedChild key={props.id} {...props.spread} />
}

export function KeyAfterSpread(props: Props) @{
	<KeyedChild {...props.spread} key={props.id} />
}
