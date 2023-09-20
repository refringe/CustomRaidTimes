import type { Wave } from "@spt-aki/models/eft/common/ILocationBase";
import type { ILocationData } from "@spt-aki/models/spt/server/ILocations";
import type { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import type { Configuration, ExtendedWave, GroupTimeParams } from "../types";
import { getRandomElement } from "../utils/array";
import { getHumanLocationName, getSpawnZones } from "../utils/locations";

/**
 * Orchestrates the entire process of adjusting spawn waves by calling other smaller, more focused functions.
 */
export function adjustSpawnWaves(location: ILocationData, config: Configuration, logger: ILogger): void {
    let waveNumber = 0;
    const largestGroup = 1;

    const groupTimeParams = calculateGroupTimeParameters(
        config.botSpawn.groupGapMinutes.min,
        config.botSpawn.groupGapMinutes.max
    );
    location.base.OpenZones = getSpawnZones(location.base.Id, true);

    if (location.base.Id === "laboratory") {
        handleLaboratoryLocation(config, logger);
        return;
    }

    logExistingWaveCount(location.base.waves.length, location, config, logger);

    const groupsNeeded = calculateGroupsNeeded(location.base.EscapeTimeLimit, groupTimeParams.middle);
    logGroupsNeededInfo(groupsNeeded, config, logger);

    // Adjust waves
    for (const originalWave of location.base.waves) {
        const wave = originalWave as ExtendedWave;
        initializeWave(wave, waveNumber, location.base.Id, groupTimeParams.max);
        adjustWaveTimings(wave, groupTimeParams);
        assignWaveGroups(wave, groupsNeeded, groupTimeParams, largestGroup);
        logWaveInfo(wave, "CustomRaidTimes:   -> Existing Wave", config, logger);
        waveNumber++;
    }

    logLargestGroupInfo(largestGroup, config, logger);

    const missingGroups = getMissingGroups(groupsNeeded, location.base.waves, config, logger);
    generateMissingGroups(missingGroups, location, groupTimeParams, config, logger);
}

/**
 * Calculates the parameters related to group time, such as minimum, maximum, offset, and middle values. These
 * parameters are used later in the logic to handle wave groups.
 */
function calculateGroupTimeParameters(min: number, max: number): GroupTimeParams {
    const groupTimeMin = min * 60;
    const groupTimeMax = max * 60;
    const groupTimeOffset = (groupTimeMax - groupTimeMin) / 2;
    return {
        min: groupTimeMin,
        max: groupTimeMax,
        offset: groupTimeOffset,
        middle: groupTimeOffset + groupTimeMin,
    };
}

/**
 * Called when the location being processed is "laboratory". Currently, this does nothing but log a debug message.
 * TODO: Implement logic for laboratory location.
 */
function handleLaboratoryLocation(config: Configuration, logger: ILogger): void {
    if (config.general.debug) {
        logger.log("CustomRaidTimes: Laboratory spawn waves are currently not adjusted.", "gray");
    }
}

/**
 * Logs the number of existing spawn waves for the specified location.
 */
function logExistingWaveCount(
    existingWavesCount: number,
    location: ILocationData,
    config: Configuration,
    logger: ILogger
): void {
    if (config.general.debug) {
        logger.log(
            `CustomRaidTimes: There are currently ${existingWavesCount} spawn waves on ${getHumanLocationName(
                location.base.Id
            )}.`,
            "gray"
        );
    }
}

/**
 * Takes the raid time and the middle value of the group time to calculate the number of groups needed to fill the raid.
 * The result is rounded up to the nearest integer, as we require at least one group.
 */
function calculateGroupsNeeded(raidTime: number, groupTimeMiddle: number): number {
    return Math.ceil((raidTime * 60) / groupTimeMiddle);
}

/**
 * Logs the calculated number of spawn groups needed, but only if the debug flag is set in the configuration.
 */
function logGroupsNeededInfo(groupsNeeded: number, config: Configuration, logger: ILogger): void {
    if (config.general.debug) {
        logger.log(
            `CustomRaidTimes:  -> To fill the raid, ${groupsNeeded} additional spawn groups are needed.`,
            "gray"
        );
    }
}

/**
 * Sets default values for the wave group and number, fills in missing spawn points, and fixes slot minimums and initial
 * wave values.
 */
function initializeWave(wave: ExtendedWave, waveNumber: number, locationId: string, groupTimeMax: number): void {
    wave.group = 1;
    wave.number = waveNumber;

    if (wave.SpawnPoints === "") {
        wave.SpawnPoints = selectRandomSpawnPoint(locationId);
    }

    if (wave.slots_max <= 0) {
        wave.slots_max = 1;
        wave.slots_min = 0;
    }

    if (wave.time_min < 0 || wave.time_max <= 0) {
        wave.time_min = 0;
        wave.time_max = groupTimeMax;
    }
}

/**
 * Sets the minimum and maximum times for the wave based on the group time parameters.
 */
function adjustWaveTimings(wave: ExtendedWave, groupTimeParams: GroupTimeParams): void {
    wave.time_min = groupTimeParams.min;
    wave.time_max = groupTimeParams.max;
}

/**
 * Iterates through the groups and assigns them to the wave based on the wave's timing. It also updates the largestGroup
 * variable if a larger group number is found.
 */
function assignWaveGroups(
    wave: ExtendedWave,
    groupsNeeded: number,
    groupTimeParams: GroupTimeParams,
    largestGroup: number
): void {
    for (let currentGroup = 1; currentGroup <= groupsNeeded; currentGroup++) {
        if (wave.time_max >= groupTimeParams.middle * currentGroup - groupTimeParams.offset) {
            wave.group = currentGroup;

            if (currentGroup > largestGroup) {
                largestGroup = currentGroup;
            }
        }
    }
}

/**
 * Logs the largest group number, but only if the debug flag is set in the configuration. It's part of the pattern used
 * throughout this code to provide additional diagnostic information during troubleshooting.
 */
function logLargestGroupInfo(largestGroup: number, config: Configuration, logger: ILogger): void {
    if (config.general.debug) {
        logger.log(`CustomRaidTimes:  -> Largest Group: ${largestGroup}`, "gray");
    }
}

/**
 * Identifies the missing groups by creating a full list of group numbers and then removing those that are already
 * present in the existing waves. It logs the missing groups if the debug flag is set in the configuration and returns
 * the array of missing group numbers.
 */
function getMissingGroups(groupsNeeded: number, waves: Wave[], config: Configuration, logger: ILogger): number[] {
    let missingGroupsDebug = "CustomRaidTimes:  -> Missing Groups: ";
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
            missingGroupsDebug.substring(0, missingGroupsDebug.length - 2) + " (" + missingGroups.length + " total)",
            "gray"
        );
    }

    return missingGroups;
}

/**
 * Takes an array of missing group numbers and iterates through them. For each missing group, it calculates a random
 * number of waves (based on the provided configuration) and then calls the `generateNewWaveGroup` function to create
 * the new wave group.
 */
function generateMissingGroups(
    missingGroups: number[],
    location: ILocationData,
    groupTimeParams: GroupTimeParams,
    config: Configuration,
    logger: ILogger
): void {
    const extendedWaves = location.base.waves as ExtendedWave[];

    missingGroups.forEach(group => {
        const numberOfWaves =
            Math.floor(Math.random() * (config.botSpawn.wavesPerGroup.max - config.botSpawn.wavesPerGroup.min + 1)) +
            config.botSpawn.wavesPerGroup.min;

        for (let index = 0; index < numberOfWaves; index++) {
            generateNewWaveGroup(group, extendedWaves, location.base.Id, groupTimeParams, config, logger);
        }
    });
}

/**
 * Chooses an existing wave to copy at random, then updates various properties, including the group number, wave times,
 * and spawn points. It also logs information about the new wave if the debug flag is set in the configuration.
 */
function generateNewWaveGroup(
    group: number,
    waves: ExtendedWave[],
    location: string,
    groupTimeParams: { min: number; max: number; offset: number; middle: number },
    config: Configuration,
    logger: ILogger
): void {
    // Choose an existing wave to copy at random.
    const newWave = { ...waves[Math.floor(Math.random() * waves.length)] };

    // Update the group and number.
    newWave.group = group;
    newWave.number = waves.length;

    // Generate new wave times based on the group.
    const newTimes = generateWaveTimes(group, groupTimeParams);
    newWave.time_max = newTimes.max;
    newWave.time_min = newTimes.min;

    // Overwrite the spawn zone to make sure that we're not spawning additional snipers.
    newWave.SpawnPoints = selectRandomSpawnPoint(location, false);

    // Tack it on the end.
    waves.push(newWave);

    logWaveInfo(newWave, "CustomRaidTimes:   -> New Wave", config, logger);
}

/**
 * Takes the group number and the previously calculated group time parameters to generate the minimum and maximum times
 * for the wave. It returns an object containing these times.
 */
function generateWaveTimes(
    group: number,
    groupTimeParams: { min: number; max: number; offset: number; middle: number }
): any {
    return {
        min: group * groupTimeParams.middle - groupTimeParams.offset,
        max: group * groupTimeParams.middle + groupTimeParams.offset,
    };
}

/**
 * Takes the location name and an optional boolean flag for sniper spawn points. It retrieves the spawn zones using the
 * getSpawnZones utility function and then selects a random element from the comma-delimited list of zones using the
 * getRandomElement utility function.
 */
function selectRandomSpawnPoint(locationName: string, sniper: boolean = true): string {
    const spawnZones = getSpawnZones(locationName, sniper);
    return getRandomElement(spawnZones.split(","));
}

/**
 * Logs information about the wave, but only if the debug flag is set in the configuration. It's part of the pattern
 * used throughout this code to provide additional diagnostic information during troubleshooting.
 */
function logWaveInfo(wave: ExtendedWave, prefixMessage: string, config: Configuration, logger: ILogger): void {
    if (config.general.debug) {
        logger.log(
            `${prefixMessage} - Group: ${wave.group}, Number: ${wave.number}, Time: ${wave.time_min}-${wave.time_max}, Slots: ${wave.slots_min}-${wave.slots_max}, Zone: ${wave.SpawnPoints}, Type: ${wave.WildSpawnType}`,
            "gray"
        );
    }
}
