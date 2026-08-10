import { Toaster } from '../../src/bases/radix/ui/sonner.tsrx';

export function ToasterFixture() @{
	<Toaster theme="dark" position="bottom-right" />
}

export function DefaultToasterFixture() @{
	<Toaster position="bottom-right" />
}
