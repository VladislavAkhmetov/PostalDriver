/**
 * Money is in the roubles of 1997, before the redenomination of 1998: petrol at 2 100 a litre,
 * a pension of a few hundred thousand. Sums are shown with a space between the thousands.
 */
export const rub = (n: number): string => `${Math.round(n).toLocaleString('ru-RU').replace(/[\u202f\u00a0 ]/g, '\u00a0')}\u00a0₽`;

/** Saves from before the switch held denominated roubles; this is how many old ones make a new one. */
export const OLD_TO_1997 = 350;
