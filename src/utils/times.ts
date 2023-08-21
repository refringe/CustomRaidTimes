import type { TimeSetting } from '../types';
import { select } from 'weighted';

export function resolveTimeSettings(settings: TimeSetting[] | number): number {
    if (typeof settings === 'number') {
        return settings;
    }

    const weightedItems: Record<number, number>[] = settings
        .filter(setting => 'minutes' in setting && 'weight' in setting)
        .map(setting => ({
            [resolveMinutes(setting.minutes)]: resolveWeight(setting.weight),
        }));

    return parseInt(Object.keys(select(weightedItems))[0], 10);
}

function resolveMinutes(minutes: number | { min: number; max: number }): number {
    return typeof minutes === 'object' ? getRandomValueInRange(minutes.min, minutes.max) : minutes;
}

function resolveWeight(weight: number | { min: number; max: number }): number {
    return typeof weight === 'object' ? getRandomValueInRange(weight.min, weight.max) : weight;
}

function getRandomValueInRange(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1) + min);
}
