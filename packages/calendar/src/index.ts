import Navigation from './Calendar/Navigation.tsrx';
import Calendar from './Calendar.tsrx';
import CenturyView from './CenturyView.tsrx';
import DecadeView from './DecadeView.tsrx';
import MonthView from './MonthView.tsrx';
import YearView from './YearView.tsrx';

export type { CalendarProps } from './Calendar.tsrx';
export type {
	CalendarType,
	NavigationLabelFunc,
	OnArgs,
	OnClickFunc,
	OnClickWeekNumberFunc,
	TileArgs,
	TileClassNameFunc,
	TileContentFunc,
	TileDisabledFunc,
} from './shared/types.js';

export { Calendar, CenturyView, DecadeView, MonthView, Navigation, YearView };

export default Calendar;
