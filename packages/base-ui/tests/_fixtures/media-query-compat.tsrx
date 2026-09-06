import { useMediaQuery } from '@octanejs/base-ui';

export function BarrelMediaQuery() @{
	<span className="mq">{(useMediaQuery('(min-width: 600px)') ? 'true' : 'false') as string}</span>
}
