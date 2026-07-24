type DivProps = { className?: string } & Record<string, unknown>;

export interface CardProps extends Record<string, unknown> {
	className?: string;
	size?: 'default' | 'sm';
}

export function Card(props: CardProps): any;
export function CardHeader(props: DivProps): any;
export function CardTitle(props: DivProps): any;
export function CardDescription(props: DivProps): any;
export function CardAction(props: DivProps): any;
export function CardContent(props: DivProps): any;
export function CardFooter(props: DivProps): any;
export {};
