import type { Client } from '@urql/core';
import { Consumer, Mutation, Provider, Query, Subscription } from '../../src/index.ts';

export function UrqlBlockChildren(props: { client: Client }) @{
	<Provider value={props.client}>
		<div>
			<Query query="{ example }" pause>
				<span id="query-block">query</span>
			</Query>
			<Mutation query="mutation Example { example }">
				<span id="mutation-block">mutation</span>
			</Mutation>
			<Subscription query="subscription Example { example }" pause>
				<span id="subscription-block">subscription</span>
			</Subscription>
			<Consumer>
				<span id="consumer-block">consumer</span>
			</Consumer>
		</div>
	</Provider>
}
