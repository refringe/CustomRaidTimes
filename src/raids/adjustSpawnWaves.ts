import type { ILocationData } from '@spt-aki/models/spt/server/ILocations';
import type { Wave } from '@spt-aki/models/eft/common/ILocationBase';
import type { ILogger } from '@spt-aki/models/spt/utils/ILogger';
import type { Configuration, ExtendedWave } from '../types';
import { getSpawnZones, getHumanLocationName } from '../utils/locations';
import { getRandomElement } from '../utils/array';

/**
 * Main function for adjusting the spawn waves.
 */
export function adjustSpawnWaves(location: ILocationData, config: Configuration, logger: ILogger): void {
    let waveNumber = 0;
    let largestGroup = 1;

    const raidTime = location.base.EscapeTimeLimit;
    const groupTimeMin = config.botSpawn.groupGapMinutes.min * 60;
    const groupTimeMax = config.botSpawn.groupGapMinutes.max * 60;
    const groupTimeOffset = (groupTimeMax - groupTimeMin) / 2;
    const groupTimeMiddle = groupTimeOffset + groupTimeMin;

    // Some locations don't have all of their spawn zones opened up. So while we're here...
    location.base.OpenZones = getSpawnZones(location.base.Id, true);

    if (location.base.Id === 'laboratory') {
        // Labs is... different.
        // TODO: Figure out how to adjust the labs raider waves... maybe.
        if (config.general.debug) {
            logger.log('CustomRaidTimes: Laboratory spawn waves are currently not adjusted.', 'gray');
        }
        return;
    }

    // The number of waves already saved in the location.
    const existingWavesCount = location.base.waves.length;
    if (config.general.debug) {
        logger.log(
            `CustomRaidTimes: There are currently ${existingWavesCount} spawn waves on ${getHumanLocationName(
                location.base.Id
            )}.`,
            'gray'
        );
    }

    // Calculate how many wave groups we need to fill the raid time.
    const groupsNeeded = calculateGroupsNeeded(raidTime, groupTimeMiddle);
    if (config.general.debug) {
        logger.log(`CustomRaidTimes:  -> To fill the raid, ${groupsNeeded} spawn groups are needed.`, 'gray');
    }

    // Fix some wave settings and create initial groups.
    for (const originalWave of location.base.waves) {
        const wave = originalWave as ExtendedWave;

        // Set a default wave group.
        wave.group = 1;

        // Fix the numbering...
        wave.number = waveNumber;

        // Fill in missing spawn points.
        if (wave.SpawnPoints == '') {
            wave.SpawnPoints = selectRandomSpawnPoint(location.base.Id);
        }

        // Fix slot minimums.
        if (wave.slots_max <= 0) {
            wave.slots_max = 1;
            wave.slots_min = 0;
        }

        // Fix initial wave values.
        if (wave.time_min < 0 || wave.time_max <= 0) {
            wave.time_min = 0;
            wave.time_max = groupTimeMax;
        }

        // Assign the default waves group numbers based on their timings.
        const waveTimeOffset = (wave.time_max - wave.time_min) / 2;
        const waveTimeMiddle = waveTimeOffset + wave.time_min;
        for (let currentGroup = 1; currentGroup <= groupsNeeded; currentGroup++) {
            if (waveTimeMiddle >= groupTimeMiddle * currentGroup - groupTimeOffset) {
                wave.group = currentGroup;

                if (currentGroup > largestGroup) {
                    largestGroup = currentGroup;
                }
            }
        }

        waveNumber++;
    }

    if (config.general.debug) {
        logger.log(`CustomRaidTimes:  -> Largest Group: ${largestGroup}`, 'gray');
    }

    const missingGroups = getMissingGroups(groupsNeeded, location.base.waves, config, logger);
    if (!missingGroups.length) {
        return;
    }

    // Generate groups of waves if we don't have enough. More won't hurt... right?
    missingGroups.forEach(group => generateGroup(group, location, groupTimeMiddle, groupTimeOffset, config, logger));
}

/**
 * The minimum number of groups to add to a raid.
 */
function calculateGroupsNeeded(raidTime: number, groupTimeMiddle: number): number {
    return Math.ceil((raidTime * 60) / groupTimeMiddle);
}

/**
 * Loops over the existing waves and returns an array of groups that need to be generated.
 */
function getMissingGroups(groupsNeeded: number, waves: Wave[], config: Configuration, logger: ILogger): number[] {
    let missingGroupsDebug = 'CustomRaidTimes:  -> Missing Groups: ';

    // Get a list of all of the group numbers that are missing.
    const missingGroups = [...Array(groupsNeeded + 1).keys()].slice(1);
    for (const originalWave of waves) {
        const wave = originalWave as ExtendedWave;
        const index = missingGroups.indexOf(wave.group);
        if (index > -1) {
            missingGroups.splice(index, 1);
        }
    }

    missingGroups.forEach(group => {
        missingGroupsDebug += `${group}, `;
    });

    if (config.general.debug) {
        logger.log(
            missingGroupsDebug.substring(0, missingGroupsDebug.length - 2) + ' (' + missingGroups.length + ' total)',
            'gray'
        );
    }

    return missingGroups;
}

/**
 * Generate a random number of waves for a group and add them to the database.
 */
function generateGroup(
    group: number,
    location: any,
    groupTimeMiddle: number,
    groupTimeOffset: number,
    config: Configuration,
    logger: ILogger
): void {
    const numberOfWaves =
        Math.floor(Math.random() * (config.botSpawn.wavesPerGroup.max - config.botSpawn.wavesPerGroup.min + 1)) +
        config.botSpawn.wavesPerGroup.min;

    for (let index = 0; index < numberOfWaves; index++) {
        generateNewWaveGroup(
            group,
            location.base.waves,
            location.base.Id,
            groupTimeMiddle,
            groupTimeOffset,
            config,
            logger
        );
    }
}

/**
 * Copies an existing wave and updates properties to create a new one. Adds it to the database.
 */
function generateNewWaveGroup(
    group: number,
    waves: ExtendedWave[],
    location: string,
    groupTimeMiddle: number,
    groupTimeOffset: number,
    config: Configuration,
    logger: ILogger
): void {
    // Choose an existing wave to copy at random.
    const newWave = { ...waves[Math.floor(Math.random() * waves.length)] };

    // Update the group and number.
    newWave.group = group;
    newWave.number = waves.length;

    // Generate new wave times based on the group.
    const newTimes = generateWaveTimes(group, groupTimeMiddle, groupTimeOffset);
    newWave.time_max = newTimes.max;
    newWave.time_min = newTimes.min;

    // Overwrite the spawn zone to make sure that we're not spawning additional snipers.
    newWave.SpawnPoints = selectRandomSpawnPoint(location, false);

    // Tack it on the end.
    waves.push(newWave);

    if (config.general.debug) {
        logger.log(
            `CustomRaidTimes:  --> New Wave Generated - Group: ${newWave.group}, Number: ${newWave.number}, Time: ${newWave.time_min}-${newWave.time_max}, Slots: ${newWave.slots_min}-${newWave.slots_max}, Zone: ${newWave.SpawnPoints}, Type: ${newWave.WildSpawnType}`,
            'gray'
        );
    }
}

/**
 * Generates a min/max time for a wave based on the group number provided.
 */
function generateWaveTimes(group: number, groupTimeMiddle: number, groupTimeOffset: number): any {
    return {
        min: group * groupTimeMiddle - groupTimeOffset,
        max: group * groupTimeMiddle + groupTimeOffset,
    };
}

/**
 * Takes a list of comma delimited zones and returns a random zone from the list.
 */
function selectRandomSpawnPoint(locationName: string, sniper: boolean = true): string {
    const spawnZones = getSpawnZones(locationName, sniper);
    return getRandomElement(spawnZones.split(','));
}
