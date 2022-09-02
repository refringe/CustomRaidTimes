import { select } from "weighted";
import { DependencyContainer } from "tsyringe";
import type { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import type { IPostDBLoadMod } from "@spt-aki/models/external/IPostDBLoadMod";
import type { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import type { StaticRouterModService } from "@spt-aki/services/mod/staticRouter/StaticRouterModService";

class CustomRaidTimes implements IPostDBLoadMod
{
    private config = require("../config/config.json");
    private container: DependencyContainer;
    private logger: ILogger;
    private debug = false;

    public postDBLoad(container: DependencyContainer):void
    {
        this.container = container;

        // Get the logger from the server container.
        this.logger = this.container.resolve<ILogger>("WinstonLogger");

        // Check to see if the mod is enabled.
        const enabled:boolean = this.config.mod_enabled;
        if (!enabled)
        {
            this.logger.info("CustomRaidTimes is disabled in the config file. No changes to raid times will be made.");
            return;
        }

        // We loud?
        this.debug = this.config.debug;

        // Get the router service from the server container.
        const staticRouterModService = this.container.resolve<StaticRouterModService>("StaticRouterModService");

        // Recalculate the raid times at the end of every raid.
        staticRouterModService.registerStaticRouter(
            "CustomRaidTimes", [{
                url: "/client/match/offline/end",
                action: (url, info, sessionId, output) =>
                {
                    this.generateCustomRaidTimes();
                    return output;
                }
            }], "aki"
        );

        // Recalculate the raid times when the server starts.
        this.generateCustomRaidTimes();
    }

    /**
     * Generates custom raid times based on a number of configuration values.
     * 
     * @returns void
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
                    this.logger.info(`CustomRaidTimes: Location '${location}' raid time changed to ${newRaidTime} minutes.`);
            }

            // Update the location with the new time.
            locations[location].base.EscapeTimeLimit = newRaidTime;

            // Adjust the AI spawn waves to fit within the new raid times.
            if (this.config.adjust_bot_waves)
            { 
                this.adjustSpawnWaves(locations[location], newRaidTime);
            }
        }

        // Update the maximum number of bots that can spawn.
        if (this.config.adjust_bot_waves && tables.globals.config.MaxBotsAliveOnMap !== this.config.maximum_bots)
        {
            tables.globals.config.MaxBotsAliveOnMap = this.config.maximum_bots;
            if (this.debug)
                this.logger.info(`CustomRaidTimes: The maximum number of bots has been changed to ${this.config.maximum_bots}.`);
        }

        if (masterTimeOverride)
        {
            if (this.debug)
                this.logger.info(`CustomRaidTimes: Map raid times changed to ${masterTimeMinutes} minutes.`);
            else
                this.logger.info("CustomRaidTimes: Map raid times updated.");
        }

        if (this.config.adjust_bot_waves)
        { 
            this.logger.warning("CustomRaidTimes: Extended spawn waves to fill new raid times. EXPERIMENTAL!");
        }
    }

    /**
     * Takes the time settings from the config file and resolves the settings into a single time.
     * 
     * @param settings The time settings from the config file.
     * 
     * @returns number
     */
    private resolveTimeSettings(settings):number
    {
        const weightedItems = [];

        // Loop through the settings and resolve the min/max values.
        for (const setting of settings)
        {
            if ("minutes" in setting && "weight" in setting)
            {
                if (typeof setting.minutes === "object" && "min" in setting.minutes && "max" in setting.minutes)
                {
                    // Get the min and max values, generate a random number between them, set the result to the minutes property.
                    setting.minutes = Math.floor(Math.random() * (setting.minutes.max - setting.minutes.min + 1) + setting.minutes.min);
                }
                if (typeof setting.weight === "object" && "min" in setting.weight && "max" in setting.weight)
                {
                    // Get the min and max values, generate a random number between them, set the result to the weight property.
                    setting.weight = Math.floor(Math.random() * (setting.weight.max - setting.weight.min + 1) + setting.weight.min);
                }
                weightedItems.push({ [setting.minutes]: setting.weight });
            }
        }

        return parseInt(Object.keys(select(weightedItems))[0], 10);
    }

    /**
     * Adjusts the AI spawn waves to fit within the new raid times.
     * 
     * @param location Location object from the database.
     * @param raidTime The new raid time to extend waves to.
     * 
     * @returns void
     */
    private adjustSpawnWaves(location:any, raidTime:number):void
    {
        let waveNumber = 0;
        let largestGroup = 1;
        const waveTimeMin = this.config.minimum_group_gap_minutes * 60;
        const groupTimeMax = this.config.maximum_group_gap_minutes * 60;

        // Some locations don't have all of their spawn zones opened up. So while we're here...
        location.base.OpenZones = this.locationSpawnZoneLookup(location.base.Id);

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

        // Calculate how many wave groups we need to fill the raid time (worst case).
        const waveGroupsNeeded = Math.ceil((raidTime * 60) / groupTimeMax);
        if (this.debug)
            this.logger.debug(` -> To fill the raid, ${waveGroupsNeeded} spawn groups are needed.`);

        // Fix some wave settings and create initial groups.
        for (const wave of location.base.waves)
        {
            // Set a default wave group.
            wave.group = 1;

            // Fix the numbering...
            wave.number = waveNumber;

            // Fill in missing spawn points.
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

            // Build out groups of waves in segments based on the config values
            for (let currentGroup = 1; currentGroup <= waveGroupsNeeded; currentGroup++)
            {
                if (wave.time_min >= (waveTimeMin * currentGroup))
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

        const missingGroups = this.getMissingGroups(waveGroupsNeeded, location.base.waves);
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
                this.generateNewWaveGroup(group, location.base.waves);
            }
        });
    }
    
    /**
     * Loops over the existing waves and returns an array of groups that need to be generated.
     * 
     * @param groupsNeeded The number of groups that need to be generated to fill the raid time.
     * @param waves The existing waves for a location.
     * 
     * @returns Array of groups that need to be generated.
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
     * 
     * @param group The wave group to generate a new wave for.
     * @param waves The current waves in a specific location.
     * 
     * @returns void
     */
    private generateNewWaveGroup(group:number, waves:any):void
    {
        // Choose an existing wave to copy at random.
        const newWave = {...waves[Math.floor(Math.random() * waves.length)]};

        // Update the group and number.
        newWave.group = group;
        newWave.number = waves.length;

        const newTimes = this.generateWaveTimes(group);

        // Generate new wave times based on the group.
        newWave.time_max = newTimes.max;
        newWave.time_min = newTimes.min;

        // Tack it on the end.
        waves.push(newWave);

        if (this.debug)
            this.logger.debug(` --> New Wave Generated - Group: ${newWave.group}, Number: ${newWave.number}, Time: ${newWave.time_min}-${newWave.time_max}, Slots: ${newWave.slots_min}-${newWave.slots_max}, Zone: ${newWave.SpawnPoints}, Type: ${newWave.WildSpawnType}`);
    }

    /**
     * Generates a min/max time for a wave based on the group number provided.
     * 
     * @param group The group number to generate times for.
     * 
     * @returns An object containing the min and max times.
     */
    private generateWaveTimes(group:number):any
    {
        // TODO: This is a bit of a hack. I need to figure out how to make this more accurate.
        return {
            min: (this.config.minimum_group_gap_minutes * 60) * group,
            max: (this.config.maximum_group_gap_minutes * 60) * group - (this.config.minimum_group_gap_minutes * 60)
        };
    }

    /**
     * Takes a list of comma delimited zones and returns a random zone from the list.
     * 
     * @param locationName The name of the location to get a spawn zone for.
     * 
     * @returns A random zone from the list.
     * 
     */
    private selectRandomSpawnPoint(locationName:string):string
    {
        const spawnZones = this.locationSpawnZoneLookup(locationName);

        return spawnZones.split(",")[Math.floor(Math.random() * spawnZones.split(",").length)];
    }

    /**
     * We named the locations in the config file nicer than the database names. This function fetches the nice config names
     * using the internal database names.
     * 
     * @param location The internal location name.
     * 
     * @returns The nice name used in the configuration file.
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
                return "reserve";
            default:
                return location;
        }
    }

    /**
     * Some locations have missing spawn zones in the database. This will return all of the spawn zones for a particular location.
     * 
     * @param location The internal location name.
     * 
     * @returns A comma delimited list of spawn zones.
     */
    private locationSpawnZoneLookup(location:string):string
    {
        switch (location.toLowerCase())
        {
            case "bigmap":
                return "ZoneBrige,ZoneCrossRoad,ZoneDormitory,ZoneGasStation,ZoneFactoryCenter,ZoneFactorySide,ZoneOldAZS,ZoneSnipeBrige,ZoneSnipeTower,ZoneSnipeFactory,ZoneBlockPost,ZoneBlockPostSniper,ZoneBlockPostSniper3,ZoneBlockPost,ZoneTankSquare,ZoneWade,ZoneCustoms,ZoneScavBase";
            case "factory4_day":
                return "BotZone";
            case "factory4_night":
                return "BotZone";
            case "interchange":
                return "ZoneCenter,ZoneCenterBot,ZoneOLI,ZoneIDEA,ZoneRoad,ZoneIDEAPark,ZoneGoshan,ZonePowerStation,ZoneTrucks,ZoneOLIPark";
            case "laboratory":
                return "BotZoneFloor1,BotZoneFloor2,BotZoneBasement";
            case "lighthouse":
                return "Zone_TreatmentContainers,Zone_LongRoad,Zone_Blockpost,Zone_TreatmentBeach,Zone_Hellicopter,Zone_RoofContainers,Zone_Village,Zone_OldHouse,Zone_RoofRocks,Zone_DestroyedHouse,Zone_Chalet,Zone_SniperPeak,Zone_RoofBeach,Zone_Containers,Zone_TreatmentRocks,Zone_Rocks";
            case "rezervbase":
                return "ZoneRailStrorage,ZonePTOR1,ZonePTOR2,ZoneBarrack,ZoneBunkerStorage,ZoneSubStorage,ZoneSubCommand";
            case "shoreline":
                return "ZoneSanatorium1,ZoneSanatorium2,ZonePassFar,ZonePassClose,ZoneTunnel,ZoneStartVillage,ZoneBunker,ZoneGreenHouses,ZoneIsland,ZoneGasStation,ZoneMeteoStation,ZonePowerStation,ZoneBusStation,ZoneRailWays,ZonePort,ZoneForestTruck,ZoneForestSpawn,ZoneForestGasStation";
            case "woods":
                return "ZoneRedHouse,ZoneWoodCutter,ZoneHouse,ZoneBigRocks,ZoneRoad,ZoneMiniHouse,ZoneScavBase2,ZoneBrokenVill,ZoneClearVill,ZoneHighRocks";
            default:
                return "";
        }
    }
}

module.exports = {mod: new CustomRaidTimes()};
