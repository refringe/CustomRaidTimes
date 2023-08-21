import type { Configuration } from '../types';
import type { ILocationData } from '@spt-aki/models/spt/server/ILocations';
import type { ILogger } from '@spt-aki/models/spt/utils/ILogger';
import { getHumanLocationName, getConfigLocationName } from '../utils/locations';
import { resolveTimeSettings } from '../utils/times';

export function adjustRaidTime(location: ILocationData, config: Configuration, logger: ILogger): void {
    // Get the human-readable location name
    const humanLocationName = getHumanLocationName(location.base.Id);

    // Check if the overrideAll configuration is set
    let newRaidTime: number;
    if (config.raidTimes.overrideAll) {
        newRaidTime = resolveTimeSettings(config.raidTimes.override);
    } else {
        // Get the custom time for the individual location
        const locationName = getConfigLocationName(location.base.Id);
        const customTime = config.raidTimes.customTimes[locationName];
        newRaidTime = resolveTimeSettings(customTime);
    }

    location.base.EscapeTimeLimit = newRaidTime;

    if (config.general.debug) {
        logger.log(`CustomRaidTimes: ${humanLocationName} raid time set to ${newRaidTime} minutes.`, 'gray');
    }
}
