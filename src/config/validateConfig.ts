import { Configuration, General, RaidTimes, TimeSetting, CustomTimes, BotSpawn } from '../types';

// Validates the given configuration object and returns an error message if it is invalid.
export function validateConfig(config: Configuration): string | null {
    const generalValidation = isValidGeneral(config.general);
    if (generalValidation !== null) {
        return generalValidation;
    }

    const raidTimesValidation = isValidRaidTimes(config.raidTimes);
    if (raidTimesValidation !== null) {
        return raidTimesValidation;
    }

    const botSpawnValidation = isValidBotSpawn(config.botSpawn);
    if (botSpawnValidation !== null) {
        return botSpawnValidation;
    }

    return null; // No errors
}

function isValidGeneral(general: General): string | null {
    if (typeof general.enabled !== 'boolean') {
        return 'The general setting "enabled" should be a boolean.';
    }
    if (typeof general.debug !== 'boolean') {
        return 'The general setting "debug" should be a boolean.';
    }
    return null;
}

function isValidRaidTimes(raidTimes: RaidTimes): string | null {
    // Validation for the 'overrideAll' field
    if (typeof raidTimes.overrideAll !== 'boolean') {
        return 'The raidTimes setting "overrideAll" should be a boolean.';
    }

    // Validation for the 'override' field
    for (const override of raidTimes.override) {
        const overrideError = isValidOverride(override);
        if (overrideError !== null) {
            return `Invalid override in raidTimes. ${overrideError}`;
        }
    }

    // Validation for the 'customTimes' field
    const customTimesError = isValidCustomTimes(raidTimes.customTimes);
    if (customTimesError !== null) {
        return `Invalid customTimes in raidTimes. ${customTimesError}`;
    }

    return null;
}

function isValidOverride(override: TimeSetting): string | null {
    // Validate 'minutes' property
    if (typeof override.minutes !== 'number' && typeof override.minutes !== 'object') {
        return 'The "minutes" property should be a number or an object with "min" and "max".';
    }

    if (typeof override.minutes === 'object') {
        if (typeof override.minutes.min !== 'number' || typeof override.minutes.max !== 'number') {
            return 'The "minutes" property should have valid "min" and "max" values.';
        }
        if (override.minutes.min >= override.minutes.max) {
            return 'The "min" value should be less than the "max" value in the "minutes" property.';
        }
    }

    // Validate 'weight' property
    if (typeof override.weight !== 'number' && typeof override.weight !== 'object') {
        return 'The "weight" property should be a number or an object with "min" and "max".';
    }

    if (typeof override.weight === 'object') {
        if (typeof override.weight.min !== 'number' || typeof override.weight.max !== 'number') {
            return 'The "weight" property should have valid "min" and "max" values.';
        }
        if (override.weight.min >= override.weight.max) {
            return 'The "min" value should be less than the "max" value in the "weight" property.';
        }
    }

    return null;
}

function isValidCustomTimes(customTimes: CustomTimes): string | null {
    for (const key in customTimes) {
        const value = customTimes[key];

        if (typeof value === 'number') continue;

        if (Array.isArray(value)) {
            for (const override of value) {
                const overrideError = isValidOverride(override);
                if (overrideError !== null) {
                    return `Invalid Override object for the location "${key}". ${overrideError}`;
                }
            }
        } else {
            return `The value for the location "${key}" should be a number or an array of Override objects.`;
        }
    }

    return null;
}

function isValidBotSpawn(botSpawn: BotSpawn): string | null {
    // Validate 'adjustWaves' property
    if (typeof botSpawn.adjustWaves !== 'boolean') {
        return 'The botSpawn setting "adjustWaves" should be a boolean.';
    }

    // Validate 'maximumBots' property
    if (typeof botSpawn.maximumBots !== 'number' || botSpawn.maximumBots < 0) {
        return 'The botSpawn setting "maximumBots" should be a non-negative number.';
    }

    // Validate 'wavesPerGroup' property
    if (
        typeof botSpawn.wavesPerGroup !== 'object' ||
        typeof botSpawn.wavesPerGroup.max !== 'number' ||
        typeof botSpawn.wavesPerGroup.min !== 'number' ||
        botSpawn.wavesPerGroup.min > botSpawn.wavesPerGroup.max
    ) {
        return 'The botSpawn setting "wavesPerGroup" should have valid "max" and "min" values with "min" less than or equal to "max".';
    }

    // Validate 'groupGapMinutes' property
    if (
        typeof botSpawn.groupGapMinutes !== 'object' ||
        typeof botSpawn.groupGapMinutes.max !== 'number' ||
        typeof botSpawn.groupGapMinutes.min !== 'number' ||
        botSpawn.groupGapMinutes.min > botSpawn.groupGapMinutes.max
    ) {
        return 'The botSpawn setting "groupGapMinutes" should have valid "max" and "min" values with "min" less than or equal to "max".';
    }

    return null; // No errors
}
