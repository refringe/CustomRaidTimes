import type { Configuration } from '../types';
import { DependencyContainer } from 'tsyringe';
import { getLogger } from '../utils/logger';
import { getLocations } from '../utils/locations';
import { adjustRaidTime, adjustTrainTime, adjustSpawnWaves } from '.';

/**
 * Adjusts all raid options based on configuration values.
 */
export function adjustRaids(container: DependencyContainer, config: Configuration): void {
    // Get the logger and debug flag from the configuration
    const logger = getLogger(container);

    // Get the locations from the configuration
    const locations = getLocations(container);
    const enabledLocations = [
        'bigmap',
        'factory4_day',
        'factory4_night',
        'interchange',
        'laboratory',
        'lighthouse',
        'rezervbase',
        'shoreline',
        'tarkovstreets',
        'woods',
    ];

    // Loop through enabled locations and adjust raid time
    for (const location of enabledLocations) {
        const locationData = locations[location];
        if (locationData) {
            adjustRaidTime(locationData, config, logger);
            adjustTrainTime(locationData, config, logger);
            adjustSpawnWaves(locationData, config, logger);
        } else {
            logger.log(`CustomRaidTimes: Location '${location}' not found. Skipping adjustment.`, 'red');
        }
    }

    logger.log(`CustomRaidTimes: Raid timings have been successfully adjusted.`, 'cyan');
}
