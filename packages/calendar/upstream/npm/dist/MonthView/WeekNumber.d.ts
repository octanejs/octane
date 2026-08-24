import type { OnClickWeekNumberFunc } from '../shared/types.js';
type ButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & {
    onClickWeekNumber: OnClickWeekNumberFunc;
};
type DivProps = React.HTMLAttributes<HTMLDivElement> & {
    onClickWeekNumber?: undefined;
};
type WeekNumberProps<T = OnClickWeekNumberFunc | undefined> = (T extends OnClickWeekNumberFunc ? ButtonProps : DivProps) & {
    date: Date;
    weekNumber: number;
};
export default function WeekNumber(props: WeekNumberProps): React.ReactElement;
export {};
