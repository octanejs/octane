import bac from './assets/payment_bac.png';
import boc from './assets/payment_boc.png';
import checkIcon from './assets/payment_check.png';
import citi from './assets/payment_citi.png';
import cmb from './assets/payment_cmb.png';
import hsbc from './assets/payment_hsbc.png';
import icbc from './assets/payment_icbc.png';

export interface BankCard {
	type: string;
	number: string;
	name: string;
}

const urlMap = new Map([
	['bac', bac],
	['boc', boc],
	['citi', citi],
	['cmb', cmb],
	['hsbc', hsbc],
	['icbc', icbc],
]);

export const getUrlByType = (type: string): string => {
	return urlMap.get(type) ?? 'URL not found';
};

export { checkIcon };

export const cards: BankCard[] = [
	{ type: 'bac', number: '4558 **** **** 6767', name: 'Alex Quentin' },
	{ type: 'boc', number: '6222 **** **** 8058', name: 'Alex Quentin' },
	{ type: 'citi', number: '4128 **** **** 5588', name: 'Alex Quentin' },
	{ type: 'cmb', number: '6225 **** **** 7689', name: 'Alex Quentin' },
	{ type: 'hsbc', number: '4565 **** **** 5168', name: 'Alex Quentin' },
	{ type: 'icbc', number: '6212 **** **** 8958', name: 'Alex Quentin' },
];
