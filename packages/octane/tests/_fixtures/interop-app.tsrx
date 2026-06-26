import { Provider, Inner } from './interop-provider.tsrx';

// `.tsrx` parent rendering through the SAME Provider — the reverse of the
// interop case. Confirms `.tsrx`→`.tsrx` children still thread correctly.
export function TsrxApp() @{
	<Provider>
		<Inner />
	</Provider>
}
