import type { ILocationBase, Wave } from "@spt-aki/models/eft/common/ILocationBase";
import type { RandomUtil } from "@spt-aki/utils/RandomUtil";
import { CustomRaidTimes } from "../CustomRaidTimes";
import { LocationProcessor } from "../processors/LocationProcessor";
import type { ExtendedWave, GroupTimeParams } from "../types";

/**
 * SpawnWaveAdjuster class.
 *
 * Handles the processing needed to elongate the number of AI spawn waves.
 */
export class SpawnWaveAdjuster {
    private location: ILocationBase;
    private locationName: { config: string; human: string };
    private randomUtil: RandomUtil;

    constructor(location: ILocationBase) {
        this.location = location;
        this.locationName = LocationProcessor.locationNames[location.Id.toString().toLowerCase()];
        this.randomUtil = CustomRaidTimes.container.resolve<RandomUtil>("RandomUtil");
    }

    /**
     * Orchestrates the logic needed to elongate the number of AI spawn waves.
     */
    public adjust(): void {
        let waveNumber = 0;
        const largestGroup = 1;

        const groupTimeParams = this.calculateGroupTimeParameters(
            CustomRaidTimes.config.botSpawn.groupGapMinutes.min,
            CustomRaidTimes.config.botSpawn.groupGapMinutes.max
        );
        this.location.OpenZones = SpawnWaveAdjuster.getSpawnZones(this.location.Id, true);

        if (this.location.Id === "laboratory") {
            this.handleLaboratoryLocation();
            return;
        }

        this.logExistingWaveCount(this.location.waves.length);

        const groupsNeeded = this.calculateGroupsNeeded(this.location.EscapeTimeLimit, groupTimeParams.middle);
        this.logGroupsNeededInfo(groupsNeeded);

        // Adjust waves
        for (const originalWave of this.location.waves) {
            const wave = originalWave as ExtendedWave;
            this.initializeWave(wave, waveNumber, this.location.Id, groupTimeParams.max);
            this.adjustWaveTimings(wave, groupTimeParams);
            this.assignWaveGroups(wave, groupsNeeded, groupTimeParams, largestGroup);
            this.logWaveInfo(wave, "CustomRaidTimes:   -> Existing Wave");
            waveNumber++;
        }

        this.logLargestGroupInfo(largestGroup);

        const missingGroups = this.getMissingGroups(groupsNeeded, this.location.waves);
        this.generateMissingGroups(missingGroups, groupTimeParams);
    }

    /**
     * Calculates the parameters related to group time, such as minimum, maximum, offset, and middle values. These
     * parameters are used later in the logic to handle wave groups.
     *
     * @param {number} min - The minimum number of minutes between groups.
     * @param {number} max - The maximum number of minutes between groups.
     * @returns {GroupTimeParams} - The group time parameters.
     */
    private calculateGroupTimeParameters(min: number, max: number): GroupTimeParams {
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
    private handleLaboratoryLocation(): void {
        if (CustomRaidTimes.config.general.debug) {
            CustomRaidTimes.logger.log("CustomRaidTimes: Laboratory spawn waves are currently not adjusted.", "gray");
        }
    }

    /**
     * Logs the number of existing spawn waves for the specified location.
     *
     * @param {number} existingWavesCount - The number of existing spawn waves.
     */
    private logExistingWaveCount(existingWavesCount: number): void {
        if (CustomRaidTimes.config.general.debug) {
            CustomRaidTimes.logger.log(
                `CustomRaidTimes: There are currently ${existingWavesCount} spawn waves on ${this.locationName.human}.`,
                "gray"
            );
        }
    }

    /**
     * Takes the raid time and the middle value of the group time to calculate the number of groups needed to fill the
     * raid. The result is rounded up to the nearest integer, as we require at least one group.
     *
     * @param {number} raidTime - The raid time in minutes.
     * @param {number} groupTimeMiddle - The middle value of the group time.
     * @returns {number} - The number of groups needed to fill the raid.
     */
    private calculateGroupsNeeded(raidTime: number, groupTimeMiddle: number): number {
        return Math.ceil((raidTime * 60) / groupTimeMiddle);
    }

    /**
     * Logs the calculated number of spawn groups needed, but only if the debug flag is set in the configuration.
     *
     * @param {number} groupsNeeded - The number of spawn groups needed to fill the raid.
     */
    private logGroupsNeededInfo(groupsNeeded: number): void {
        if (CustomRaidTimes.config.general.debug) {
            CustomRaidTimes.logger.log(
                `CustomRaidTimes:  -> To fill the raid, ${groupsNeeded} additional spawn groups are needed.`,
                "gray"
            );
        }
    }

    /**
     * Sets default values for the wave group and number, fills in missing spawn points, and fixes slot minimums and
     * initial wave values.
     *
     * @param {ExtendedWave} wave - The wave to initialize.
     * @param {number} waveNumber - The wave number.
     * @param {string} locationId - The location ID.
     * @param {number} groupTimeMax - The maximum group time.
     */
    private initializeWave(wave: ExtendedWave, waveNumber: number, locationId: string, groupTimeMax: number): void {
        wave.group = 1;
        wave.number = waveNumber;

        if (wave.SpawnPoints === "") {
            wave.SpawnPoints = this.selectRandomSpawnPoint(locationId);
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
     *
     * @param {ExtendedWave} wave - The wave to adjust.
     * @param {GroupTimeParams} groupTimeParams - The group time parameters.
     */
    private adjustWaveTimings(wave: ExtendedWave, groupTimeParams: GroupTimeParams): void {
        wave.time_min = groupTimeParams.min;
        wave.time_max = groupTimeParams.max;
    }

    /**
     * Iterates through the groups and assigns them to the wave based on the wave's timing. It also updates the
     * largestGroup variable if a larger group number is found.
     *
     * @param {ExtendedWave} wave - The wave to assign.
     * @param {number} groupsNeeded - The number of groups needed to fill the raid.
     * @param {GroupTimeParams} groupTimeParams - The group time parameters.
     * @param {number} largestGroup - The largest group number.
     */
    private assignWaveGroups(
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
     * Logs the largest group number, but only if the debug flag is set in the configuration. It's part of the pattern
     * used throughout this code to provide additional diagnostic information during troubleshooting.
     *
     * @param {number} largestGroup - The largest group number.
     */
    private logLargestGroupInfo(largestGroup: number): void {
        if (CustomRaidTimes.config.general.debug) {
            CustomRaidTimes.logger.log(`CustomRaidTimes:  -> Largest Group: ${largestGroup}`, "gray");
        }
    }

    /**
     * Identifies the missing groups by creating a full list of group numbers and then removing those that are already
     * present in the existing waves. It logs the missing groups if the debug flag is set in the configuration and
     * returns the array of missing group numbers.
     *
     * @param {number} groupsNeeded - The number of groups needed to fill the raid.
     * @param {Wave[]} waves - The existing waves.
     * @returns {number[]} - The array of missing group numbers.
     */
    private getMissingGroups(groupsNeeded: number, waves: Wave[]): number[] {
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

        if (CustomRaidTimes.config.general.debug) {
            CustomRaidTimes.logger.log(
                missingGroupsDebug.substring(0, missingGroupsDebug.length - 2) +
                    " (" +
                    missingGroups.length +
                    " total)",
                "gray"
            );
        }

        return missingGroups;
    }

    /**
     * Takes an array of missing group numbers and iterates through them. For each missing group, it calculates a random
     * number of waves (based on the provided configuration) and then calls the `generateNewWaveGroup` function to
     * create the new wave group.
     *
     * @param {number[]} missingGroups - The array of missing group numbers.
     * @param {GroupTimeParams} groupTimeParams - The group time parameters.
     */
    private generateMissingGroups(missingGroups: number[], groupTimeParams: GroupTimeParams): void {
        const extendedWaves = this.location.waves as ExtendedWave[];

        missingGroups.forEach(group => {
            const numberOfWaves =
                Math.floor(
                    Math.random() *
                        (CustomRaidTimes.config.botSpawn.wavesPerGroup.max -
                            CustomRaidTimes.config.botSpawn.wavesPerGroup.min +
                            1)
                ) + CustomRaidTimes.config.botSpawn.wavesPerGroup.min;

            for (let index = 0; index < numberOfWaves; index++) {
                this.generateNewWaveGroup(group, extendedWaves, this.location.Id, groupTimeParams);
            }
        });
    }

    /**
     * Chooses an existing wave to copy at random, then updates various properties, including the group number, wave
     * times, and spawn points. It also logs information about the new wave if the debug flag is set in
     * the configuration.
     *
     * @param {number} group - The group number.
     * @param {ExtendedWave[]} waves - The existing waves.
     * @param {string} location - The location ID.
     * @param {GroupTimeParams} groupTimeParams - The group time parameters.
     */
    private generateNewWaveGroup(
        group: number,
        waves: ExtendedWave[],
        location: string,
        groupTimeParams: GroupTimeParams
    ): void {
        // Choose an existing wave to copy at random.
        const newWave = { ...waves[Math.floor(Math.random() * waves.length)] };

        // Update the group and number.
        newWave.group = group;
        newWave.number = waves.length;

        // Generate new wave times based on the group.
        const newTimes = this.generateWaveTimes(group, groupTimeParams);
        newWave.time_max = newTimes.max;
        newWave.time_min = newTimes.min;

        // Overwrite the spawn zone to make sure that we're not spawning additional snipers.
        newWave.SpawnPoints = this.selectRandomSpawnPoint(location, false);

        // Tack it on the end.
        waves.push(newWave);

        this.logWaveInfo(newWave, "CustomRaidTimes:   -> New Wave");
    }

    /**
     * Takes the group number and the previously calculated group time parameters to generate the minimum and maximum
     * times for the wave. It returns an object containing these times.
     *
     * @param {number} group - The group number.
     * @param {GroupTimeParams} groupTimeParams - The group time parameters.
     */
    private generateWaveTimes(group: number, groupTimeParams: GroupTimeParams): any {
        return {
            min: group * groupTimeParams.middle - groupTimeParams.offset,
            max: group * groupTimeParams.middle + groupTimeParams.offset,
        };
    }

    /**
     * Takes the location name and an optional boolean flag for sniper spawn points. It retrieves the spawn zones using
     * the getSpawnZones utility function and then selects a random element from the comma-delimited list of zones using
     * the getRandomElement utility function.
     *
     * @param {string} locationName - The location name.
     * @param {boolean} sniper - Whether or not to include sniper spawn points. Defaults to true.
     */
    private selectRandomSpawnPoint(locationName: string, sniper: boolean = true): string {
        const spawnZones = SpawnWaveAdjuster.getSpawnZones(locationName, sniper);
        return this.randomUtil.getArrayValue(spawnZones.split(","));
    }

    /**
     * Logs information about the wave, but only if the debug flag is set in the configuration. It's part of the pattern
     * used throughout this code to provide additional diagnostic information during troubleshooting.
     *
     * @param {ExtendedWave} wave - The wave to log.
     * @param {string} prefixMessage - The prefix message to use when logging.
     */
    private logWaveInfo(wave: ExtendedWave, prefixMessage: string): void {
        if (CustomRaidTimes.config.general.debug) {
            CustomRaidTimes.logger.log(
                `${prefixMessage} - Group: ${wave.group}, Number: ${wave.number}, Time: ${wave.time_min}-${wave.time_max}, Slots: ${wave.slots_min}-${wave.slots_max}, Zone: ${wave.SpawnPoints}, Type: ${wave.WildSpawnType}`,
                "gray"
            );
        }
    }

    /**
     * Takes the location name and returns a comma-delimited list of spawn zones for that location. Set the optional
     * sniper parameter to false to ignore all sniper spawn points.
     *
     * @param {string} gameLocationName - The location name.
     * @param {boolean} sniper - Whether or not to include sniper spawn points. Defaults to true.
     */
    private static getSpawnZones(gameLocationName: string, sniper = true): string {
        const baseZones = [];
        const sniperZones = [];

        switch (gameLocationName.toLowerCase()) {
            case "bigmap":
                baseZones.push(
                    "ZoneBrige",
                    "ZoneCrossRoad",
                    "ZoneDormitory",
                    "ZoneGasStation",
                    "ZoneFactoryCenter",
                    "ZoneFactorySide",
                    "ZoneOldAZS",
                    "ZoneBlockPost",
                    "ZoneBlockPost",
                    "ZoneTankSquare",
                    "ZoneWade",
                    "ZoneCustoms",
                    "ZoneScavBase"
                );
                sniperZones.push(
                    "ZoneSnipeBrige",
                    "ZoneSnipeTower",
                    "ZoneSnipeFactory",
                    "ZoneBlockPostSniper",
                    "ZoneBlockPostSniper3"
                );
                break;
            case "factory4_day":
            case "factory4_night":
                baseZones.push("BotZone");
                break;
            case "interchange":
                baseZones.push(
                    "ZoneCenter",
                    "ZoneCenterBot",
                    "ZoneOLI",
                    "ZoneIDEA",
                    "ZoneRoad",
                    "ZoneIDEAPark",
                    "ZoneGoshan",
                    "ZonePowerStation",
                    "ZoneTrucks",
                    "ZoneOLIPark"
                );
                break;
            case "laboratory":
                baseZones.push("BotZoneFloor1", "BotZoneFloor2", "BotZoneBasement");
                break;
            case "lighthouse":
                baseZones.push(
                    "Zone_TreatmentContainers",
                    "Zone_LongRoad",
                    "Zone_Blockpost",
                    "Zone_TreatmentBeach",
                    "Zone_Hellicopter",
                    "Zone_RoofContainers",
                    "Zone_Village",
                    "Zone_OldHouse",
                    "Zone_RoofRocks",
                    "Zone_DestroyedHouse",
                    "Zone_Chalet",
                    "Zone_RoofBeach",
                    "Zone_Containers",
                    "Zone_TreatmentRocks",
                    "Zone_Rocks",
                    "Zone_Island"
                );
                sniperZones.push("Zone_SniperPeak");
                break;
            case "rezervbase":
                baseZones.push(
                    "ZoneRailStrorage",
                    "ZonePTOR1",
                    "ZonePTOR2",
                    "ZoneBarrack",
                    "ZoneBunkerStorage",
                    "ZoneSubStorage",
                    "ZoneSubCommand"
                );
                break;
            case "shoreline":
                baseZones.push(
                    "ZoneSanatorium1",
                    "ZoneSanatorium2",
                    "ZonePassFar",
                    "ZonePassClose",
                    "ZoneTunnel",
                    "ZoneStartVillage",
                    "ZoneBunker",
                    "ZoneGreenHouses",
                    "ZoneIsland",
                    "ZoneGasStation",
                    "ZoneMeteoStation",
                    "ZonePowerStation",
                    "ZoneBusStation",
                    "ZoneRailWays",
                    "ZonePort",
                    "ZoneForestTruck",
                    "ZoneForestSpawn",
                    "ZoneForestGasStation"
                );
                sniperZones.push("ZonePowerStationSniper", "ZoneBunkeSniper");
                break;
            case "tarkovstreets":
                baseZones.push(
                    "ZoneCarShowroom",
                    "ZoneCinema",
                    "ZoneColumn",
                    "ZoneConcordia_1",
                    "ZoneConcordia_2",
                    "ZoneConcordiaParking",
                    "ZoneConstruction",
                    "ZoneFactory",
                    "ZoneHotel_1",
                    "ZoneHotel_2",
                    "ZoneSW01"
                );
                sniperZones.push("ZoneSnipeBuilding", "ZoneSnipeCarShowroom", "ZoneSnipeCinema", "ZoneSnipeSW01");
                break;
            case "woods":
                baseZones.push(
                    "ZoneRedHouse",
                    "ZoneWoodCutter",
                    "ZoneHouse",
                    "ZoneBigRocks",
                    "ZoneRoad",
                    "ZoneMiniHouse",
                    "ZoneScavBase2",
                    "ZoneBrokenVill",
                    "ZoneClearVill",
                    "ZoneHighRocks"
                );
                break;
            default:
                return "";
        }

        return baseZones.concat(sniper ? sniperZones : []).join(",");
    }
}
