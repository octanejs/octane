import Select, { NonceProvider } from '../src/index';

export function NonceFixture(props: { cacheKey: string; nonce: string }) @{
	<NonceProvider cacheKey={props.cacheKey} nonce={props.nonce}>
		<Select
			instanceId="nonce"
			options={[
				{ label: 'One', value: '1' },
			]}
		/>
	</NonceProvider>
}
