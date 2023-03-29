import type { IPostDBLoadModAsync } from "@spt-aki/models/external/IPostDBLoadModAsync";
import type { IPreAkiLoadModAsync } from "@spt-aki/models/external/IPreAkiLoadModAsync";
import { LogBackgroundColor } from "@spt-aki/models/spt/logging/LogBackgroundColor";
import { LogTextColor } from "@spt-aki/models/spt/logging/LogTextColor";
import type { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import type { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import type { StaticRouterModService } from "@spt-aki/services/mod/staticRouter/StaticRouterModService";
import { DependencyContainer } from "tsyringe";
import { select } from "weighted";

class CustomRaidTimes implements IPreAkiLoadModAsync, IPostDBLoadModAsync
{
    private config:any;
    private container:DependencyContainer;
    private logger:ILogger;
    private debug = false;

    public async preAkiLoadAsync(container: DependencyContainer): Promise<void>
    {
        require("json5/lib/register");
        this.config = require("../config/config.json5");

        this.container = container;

        // Get the logger from the server container.
        this.logger = this.container.resolve<ILogger>("WinstonLogger");

        // Check to see if the mod is enabled.
        if (!this.config.enabled)
        {
            this.logger.logWithColor("CustomRaidTimes is disabled in the config file.", LogTextColor.RED, LogBackgroundColor.DEFAULT);
            return;
        }

        // We loud?
        this.debug = this.config.debug;

        // Hook into the match end route to recalculate the raid times.
        const staticRouterModService = container.resolve<StaticRouterModService>("StaticRouterModService");
        staticRouterModService.registerStaticRouter(
            "CustomRaidTimesMatchEnd", [{
                url: "/client/match/offline/end",
                action: (url, info, sessionId, output) =>
                {
                    if (this.debug)
                        this.logger.logWithColor("CustomRaidTimes: CustomRaidTimesMatchEnd route has been triggered.", LogTextColor.CYAN, LogBackgroundColor.DEFAULT);

                    this.generateCustomRaidTimes();
                    return output;
                }
            }], "CustomRaidTimesMatchEnd"
        );
    }

    public async postDBLoadAsync():Promise<void>
    {
        if (!this.config.enabled)
            return;
        
        // Initially recalculate the raid times after the database has loaded.
        this.generateCustomRaidTimes();
    }

    /**
     * Generates custom raid times based on a number of configuration values.
     */
    private generateCustomRaidTimes():void
    {
        // Initialize an array of the location names
        const locationNames = [
            "bigmap",
            "factory4_day",
            "factory4_night",
            "interchange",
            "laboratory",
            "lighthouse",
            "rezervbase",
            "shoreline",
            "tarkovstreets",
            "woods"
        ];

        // Get the database tables.
        const tables = this.container.resolve<DatabaseServer>("DatabaseServer").getTables();

        // Get the location data
        const locations = tables.locations;

        // Get override options from config file.
        const masterTimeOverride:boolean = this.config.master_time_override;
        const masterTimeMinutes:number = this.resolveTimeSettings(this.config.master_time_minutes);

        // Loop through each location
        for (const location of locationNames)
        {
            // Get the config location name.
            const locationName = this.locationNameLookup(location);

            // Set the new raid time for this location.
            const newRaidTime:number = masterTimeOverride ? masterTimeMinutes : this.resolveTimeSettings(this.config.custom_times[locationName]);

            // Log any changes from the default map times.
            if (!masterTimeOverride && locations[location].base.EscapeTimeLimit != newRaidTime)
            {
                if (this.debug)
                    this.logger.logWithColor(`CustomRaidTimes: Location '${this.locationNameLookup(location)}' raid time changed to ${newRaidTime} minutes.`, LogTextColor.CYAN, LogBackgroundColor.DEFAULT);
            }

            // Update the location with the new time.
            locations[location].base.EscapeTimeLimit = newRaidTime;

            // Adjust the timing of train extracts so they always fit within the new raid time.
            this.adjustTrainExtracts(locations[location], newRaidTime);

            // Adjust the AI spawn waves to fit within the new raid times.
            if (this.config.adjust_bot_waves)
                this.adjustSpawnWaves(locations[location], newRaidTime);
        }

        // Update the maximum number of bots that can spawn.
        if (this.config.adjust_bot_waves && tables.globals.config.MaxBotsAliveOnMap !== this.config.maximum_bots)
        {
            tables.globals.config.MaxBotsAliveOnMap = this.config.maximum_bots;
            if (this.debug)
                this.logger.logWithColor(`CustomRaidTimes: The maximum number of bots has been changed to ${this.config.maximum_bots}.`, LogTextColor.CYAN, LogBackgroundColor.DEFAULT);
        }

        if (masterTimeOverride && this.debug)
            this.logger.logWithColor(`CustomRaidTimes: All map raid times changed to ${masterTimeMinutes} minutes.`, LogTextColor.CYAN, LogBackgroundColor.DEFAULT);
        else
            this.logger.logWithColor("CustomRaidTimes: Map raid times have been regenerated.", LogTextColor.CYAN, LogBackgroundColor.DEFAULT);

        if (this.config.adjust_bot_waves)
            this.logger.logWithColor("CustomRaidTimes: Extended spawn waves to fill new raid times.", LogTextColor.CYAN, LogBackgroundColor.DEFAULT);
    }

    /**
     * Takes the time settings from the config file and resolves the settings into a single time.
     */
    private resolveTimeSettings(settings:any):number
    {
        const weightedItems:any = [];

        // Loop through the settings and resolve the min/max values.
        for (const setting of settings)
        {
            if ("minutes" in setting && "weight" in setting)
            {
                // Get the min and max values, generate a random number between them, set the result to the minutes property.
                let minutes:number = 0;
                if (typeof setting.minutes === "object" && "min" in setting.minutes && "max" in setting.minutes)
                    minutes = Math.floor(Math.random() * (setting.minutes.max - setting.minutes.min + 1) + setting.minutes.min);
                else
                    minutes = parseInt(setting.minutes, 10);

                // Get the min and max values, generate a random number between them, set the result to the weight property.
                let weight:number;
                if (typeof setting.weight === "object" && "min" in setting.weight && "max" in setting.weight)
                    weight = Math.floor(Math.random() * (setting.weight.max - setting.weight.min + 1) + setting.weight.min);
                else
                    weight = parseInt(setting.weight, 10);

                weightedItems.push({ [minutes]: weight });
            }
        }

        return parseInt(Object.keys(select(weightedItems))[0], 10);
    }

    /**
     * Adjust the timing of train extracts so they always fit within the new raid time.
     */
    private adjustTrainExtracts(location:any, raidTime:number):void
    {
        for (const exit of location.base.exits)
        {            
            if (exit.PassageRequirement == "Train")
            {
                // Total raid time.
                const raidTimeSec = raidTime * 60;

                // The number of seconds that it takes the train to animate into position.
                // This value (97) will help adjust the train extract to a minimum of 10 seconds before the end of the raid.
                const trainPositionSec = 97;

                // The number of seconds the user must wait on the train for a successful extract.
                const trainExtractWaitSec:number = exit.ExfiltrationTime;

                // Number of seconds the train waits before closing the doors and departing.
                // Default is random between 14 and 5 minutes.
                let trainWaitSec = 60 * (Math.floor(Math.random() * (14 - 5) + 5));

                // Minimum number of seconds the train waits before closing the doors and departing in case the time needs to be automatically adjsuted.
                const minTrainWaitSec = 60;

                // Latest time the train can arrive.
                let trainArriveLatest = this.calculateLatestTrainArrivalTime(raidTimeSec, trainPositionSec, trainExtractWaitSec, trainWaitSec);

                // Number of seconds to vary the arrival time by. Only used for short raids.
                // Default is a 5 minute window.
                let trainArriveRandomRange = 60 * 5;

                // The earliest time the train can arrive.
                let trainArriveEarliest = trainArriveLatest - trainArriveRandomRange;

                // If the latest time is in range, but the earliest time is too early, set the earliest time to immediately.
                if (trainArriveLatest > 0 && trainArriveEarliest < 0)
                {
                    trainArriveEarliest = 0;
                    trainArriveRandomRange = trainArriveLatest;
                }

                // If the latest time the train can arrive is too late, get the train to arrive as soon a possible and try to reduce the train wait time.
                else if (trainArriveLatest <= 0)
                {
                    trainArriveEarliest = 0;
                    trainArriveLatest = 0;

                    // Reduce the train wait time.
                    do
                    {
                        trainWaitSec--;
                        trainArriveLatest = this.calculateLatestTrainArrivalTime(raidTimeSec, trainPositionSec, trainExtractWaitSec, trainWaitSec);
                    }
                    while (trainArriveLatest < 0 && trainWaitSec > minTrainWaitSec);

                    if (trainArriveLatest < 0)
                        this.logger.warning(`CustomRaidTimes: Location '${this.locationNameLookup(location.base.Name)}' Train Schedule - Train can not depart before end of raid.`);
                }

                // If there is more than 5 minutes of buffer time before the train arrives, adjust the timing so that the train doesn't always show up at the
                // end of a raid. Additionally, this should adjust the train schedule timing of longer raid times so that they're somewhat random in nature.
                if (trainArriveEarliest > 300)
                {
                    // Adjust the earliest arrival time by 65% to 20% of the available time. This is a minimum of 1 minute.
                    const adjustmentPercentage = parseFloat((Math.random() * (0.65 - 0.2) + 0.2).toFixed(2));
                    const adjustmentTime = Math.floor(trainArriveEarliest * adjustmentPercentage);

                    trainArriveEarliest = trainArriveEarliest - adjustmentTime;
                }

                exit.MinTime = trainArriveEarliest;
                exit.MaxTime = trainArriveLatest;
                exit.Count = trainWaitSec;

                if (this.debug)
                    this.logger.logWithColor(`CustomRaidTimes: ${this.locationNameLookup(location.base.Name).charAt(0).toUpperCase() + this.locationNameLookup(location.base.Name).slice(1)} Train Schedule - Earliest: ${(trainArriveEarliest / 60).toFixed(2)} minutes, Latest: ${(trainArriveLatest / 60).toFixed(2)} minutes, Wait: ${(trainWaitSec / 60).toFixed(2)} minutes.`, LogTextColor.CYAN, LogBackgroundColor.DEFAULT);
            }
        }
    }

    /**
     * Simply calculates the latest train arrival time based on other time settings.
     */
    private calculateLatestTrainArrivalTime(raidTimeSec:number, trainPositionSec:number, trainExtractWaitSec:number, trainWaitSec:number):number
    {
        return raidTimeSec - trainPositionSec - trainExtractWaitSec - trainWaitSec;
    }

    /**
     * Adjusts the AI spawn waves to fit within the new raid times.
     */
    private adjustSpawnWaves(location:any, raidTime:number):void
    {
        let waveNumber = 0;
        let largestGroup = 1;
        
        const groupTimeMin = this.config.minimum_group_gap_minutes * 60;
        const groupTimeMax = this.config.maximum_group_gap_minutes * 60;
        const groupTimeOffset = (groupTimeMax - groupTimeMin) / 2;
        const groupTimeMiddle = groupTimeOffset + groupTimeMin;

        // Some locations don't have all of their spawn zones opened up. So while we're here...
        location.base.OpenZones = this.locationSpawnZoneLookup(location.base.Id, true);

        if (location.base.Id === "laboratory")
        {
            // Labs is... different.
            // TODO: Figure out how to adjust the labs raider waves... maybe.
            return;
        }

        // The number of waves already saved in the location.
        const existingWavesCount = location.base.waves.length;
        if (this.debug)
            this.logger.debug(`There are currently ${existingWavesCount} spawn waves on ${this.locationNameLookup(location.base.Id)}.`);

        // Calculate how many wave groups we need to fill the raid time.
        const groupsNeeded = Math.ceil((raidTime * 60) / groupTimeMiddle);
        if (this.debug)
            this.logger.debug(` -> To fill the raid, ${groupsNeeded} spawn groups are needed.`);

        // Fix some wave settings and create initial groups.
        for (const wave of location.base.waves)
        {
            // Set a default wave group.
            wave.group = 1;

            // Fix the numbering...
            wave.number = waveNumber;

            // Fill in missing spawn points.
            if (wave.SpawnPoints == '')
                wave.SpawnPoints = this.selectRandomSpawnPoint(location.base.Id);

            // Fix slot minimums.
            if (wave.slots_max <= 0)
            {
                wave.slots_max = 1;
                wave.slots_min = 0;
            }

            // Fix initial wave values.
            if (wave.time_min < 0 || wave.time_max <= 0)
            {
                wave.time_min = 0;
                wave.time_max = groupTimeMax;
            }

            // Assign the default waves group numbers based on their timings.
            const waveTimeOffset = (wave.time_max - wave.time_min) / 2;
            const waveTimeMiddle = waveTimeOffset + wave.time_min;
            for (let currentGroup = 1; currentGroup <= groupsNeeded; currentGroup++)
            {
                if (waveTimeMiddle >= (groupTimeMiddle * currentGroup) - groupTimeOffset)
                {
                    wave.group = currentGroup;

                    if (currentGroup > largestGroup)
                        largestGroup = currentGroup;
                }
            }
            
            waveNumber++;
        }

        if (this.debug)
            this.logger.debug(` -> Largest Group: ${largestGroup}`);

        const missingGroups = this.getMissingGroups(groupsNeeded, location.base.waves);
        if (!missingGroups.length)
        {
            return;
        }

        // Generate groups of waves if we don't have enough. More won't hurt... right?
        missingGroups.forEach(group =>
        {
            // Generate a random number of waves.
            const numberOfWaves = Math.floor(Math.random() * (this.config.maximum_wave_per_group - this.config.minimum_wave_per_group + 1)) + this.config.minimum_wave_per_group;
            for (let index = 0; index < numberOfWaves; index++)
            {
                this.generateNewWaveGroup(group, location.base.waves, location.base.Id, groupTimeMiddle, groupTimeOffset);
            }
        });
    }
    
    /**
     * Loops over the existing waves and returns an array of groups that need to be generated.
     */
    private getMissingGroups(groupsNeeded:number, waves:any):number[]
    {
        let missingGroupsDebug = " -> Missing Groups: ";

        // Get a list of all of the group numbers that are missing.
        const missingGroups = [...Array(groupsNeeded + 1).keys()].slice(1);
        for (const wave of waves)
        {
            const index = missingGroups.indexOf(wave.group);
            if (index > -1)
            {
                missingGroups.splice(index, 1);
            }
        }

        missingGroups.forEach(group =>
        {
            missingGroupsDebug += `${group}, `;
        });
        if (this.debug)
            this.logger.debug(missingGroupsDebug.substring(0, missingGroupsDebug.length - 2) + " (" + missingGroups.length + " total)");

        return missingGroups;
    }

    /**
     * Copies an existing wave and updates some properties to create a new one. Add it to the database.
     */
    private generateNewWaveGroup(group:number, waves:any, location:any, groupTimeMiddle:number, groupTimeOffset:number):void
    {
        // Choose an existing wave to copy at random.
        const newWave = {...waves[Math.floor(Math.random() * waves.length)]};

        // Update the group and number.
        newWave.group = group;
        newWave.number = waves.length;

        // Generate new wave times based on the group.
        const newTimes = this.generateWaveTimes(group, groupTimeMiddle, groupTimeOffset);
        newWave.time_max = newTimes.max;
        newWave.time_min = newTimes.min;

        // Overwrite the spawn zone to make sure that we're not spawning additional snipers.
        newWave.SpawnPoints = this.selectRandomSpawnPoint(location, false);
        
        // Tack it on the end.
        waves.push(newWave);

        if (this.debug)
            this.logger.debug(` --> New Wave Generated - Group: ${newWave.group}, Number: ${newWave.number}, Time: ${newWave.time_min}-${newWave.time_max}, Slots: ${newWave.slots_min}-${newWave.slots_max}, Zone: ${newWave.SpawnPoints}, Type: ${newWave.WildSpawnType}`);
    }

    /**
     * Generates a min/max time for a wave based on the group number provided.
     */
    private generateWaveTimes(group:number, groupTimeMiddle:number, groupTimeOffset:number):any
    {
        return {
            min: (group * groupTimeMiddle) - groupTimeOffset,
            max: (group * groupTimeMiddle) + groupTimeOffset
        };
    }

    /**
     * Takes a list of comma delimited zones and returns a random zone from the list.
     */
    private selectRandomSpawnPoint(locationName:string, sniper = true):string
    {
        const spawnZones = this.locationSpawnZoneLookup(locationName, sniper);

        return spawnZones.split(",")[Math.floor(Math.random() * spawnZones.split(",").length)];
    }

    /**
     * We named the locations in the config file nicer than the database names. This function fetches the nice config names
     * using the internal database names.
     */
    private locationNameLookup(location:string):string
    {
        location = location.toLowerCase();

        switch (location)
        {
            case "bigmap":
                return "customs";
            case "factory4_day":
                return "factory_day";
            case "factory4_night":
                return "factory_night";
            case "rezervbase":
            case "reservebase":
                return "reserve";
            case "tarkovstreets":
                return "streets";
            default:
                return location;
        }
    }

    /**
     * Some locations have missing spawn zones in the database. This will return all of the spawn zones for a particular location.
     */
    private locationSpawnZoneLookup(location:string, sniper = true):string
    {
        switch (location.toLowerCase())
        {
            case "bigmap":
                return "ZoneBrige,ZoneCrossRoad,ZoneDormitory,ZoneGasStation,ZoneFactoryCenter,ZoneFactorySide,ZoneOldAZS,ZoneBlockPost,ZoneBlockPost,ZoneTankSquare,ZoneWade,ZoneCustoms,ZoneScavBase" + (sniper ? ",ZoneSnipeBrige,ZoneSnipeTower,ZoneSnipeFactory,ZoneBlockPostSniper,ZoneBlockPostSniper3" : "");
            case "factory4_day":
                return "BotZone";
            case "factory4_night":
                return "BotZone";
            case "interchange":
                return "ZoneCenter,ZoneCenterBot,ZoneOLI,ZoneIDEA,ZoneRoad,ZoneIDEAPark,ZoneGoshan,ZonePowerStation,ZoneTrucks,ZoneOLIPark";
            case "laboratory":
                return "BotZoneFloor1,BotZoneFloor2,BotZoneBasement";
            case "lighthouse":
                return "Zone_TreatmentContainers,Zone_LongRoad,Zone_Blockpost,Zone_TreatmentBeach,Zone_Hellicopter,Zone_RoofContainers,Zone_Village,Zone_OldHouse,Zone_RoofRocks,Zone_DestroyedHouse,Zone_Chalet,Zone_RoofBeach,Zone_Containers,Zone_TreatmentRocks,Zone_Rocks,Zone_Island" + (sniper ? ",Zone_SniperPeak" : "");
            case "rezervbase":
                return "ZoneRailStrorage,ZonePTOR1,ZonePTOR2,ZoneBarrack,ZoneBunkerStorage,ZoneSubStorage,ZoneSubCommand";
            case "shoreline":
                return "ZoneSanatorium1,ZoneSanatorium2,ZonePassFar,ZonePassClose,ZoneTunnel,ZoneStartVillage,ZoneBunker,ZoneGreenHouses,ZoneIsland,ZoneGasStation,ZoneMeteoStation,ZonePowerStation,ZoneBusStation,ZoneRailWays,ZonePort,ZoneForestTruck,ZoneForestSpawn,ZoneForestGasStation" + (sniper ? ",ZonePowerStationSniper,ZoneBunkeSniper" : "");
            case "tarkovstreets":
                return "ZoneCarShowroom,ZoneCinema,ZoneColumn,ZoneConcordia_1,ZoneConcordia_2,ZoneConcordiaParking,ZoneConstruction,ZoneFactory,ZoneHotel_1,ZoneHotel_2,ZoneSW01" + (sniper ? ",ZoneSnipeBuilding,ZoneSnipeCarShowroom,ZoneSnipeCinema,ZoneSnipeSW01" : "");
            case "woods":
                return "ZoneRedHouse,ZoneWoodCutter,ZoneHouse,ZoneBigRocks,ZoneRoad,ZoneMiniHouse,ZoneScavBase2,ZoneBrokenVill,ZoneClearVill,ZoneHighRocks";
            default:
                return "";
        }
    }
}

module.exports = {mod: new CustomRaidTimes()};
