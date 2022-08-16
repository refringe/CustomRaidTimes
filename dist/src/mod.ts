import { DependencyContainer } from "tsyringe";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { IPostDBLoadMod } from "@spt-aki/models/external/IPostDBLoadMod";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";

class CustomRaidTimes implements IPostDBLoadMod
{
    private config = require("../config/config.json");

    public postDBLoad(container: DependencyContainer): void
    {
        // Get the logger from the server container
        const logger = container.resolve<ILogger>("WinstonLogger");

        // Check to see if the mod is enabled.
        const enabled:boolean = this.config.mod_enabled;
        if (!enabled)
        {
            logger.info("CustomRaidTimes is disabled in the config file. No changes to raid times will be made.");
            return;
        }

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

        // Get database from server
        const databaseServer = container.resolve<DatabaseServer>("DatabaseServer");

        // Get in-memory json found in /assets/database
        const tables = databaseServer.getTables();

        // Select the location data
        const locations = tables.locations;

        // Get override options from config file.
        const masterTimeOverride:boolean = this.config.master_time_override;
        const masterTimeMinutes:number = this.config.master_time_minutes;

        // Loop through each location
        for (const location of locationNames)
        {
            // Set the new raid time for this location.
            const newRaidTime:number = masterTimeOverride ? masterTimeMinutes : this.config.custom_times[location];

            // Log any changes from the default map times.
            if (!masterTimeOverride && locations[location].base.EscapeTimeLimit != newRaidTime)
            {
                logger.info(`CustomRaidTimes: Location '${location}' raid time changed to ${newRaidTime} minutes.`);
            }

            // Engage.
            locations[location].base.EscapeTimeLimit = newRaidTime;
        }

        if (masterTimeOverride)
        {
            logger.info(`CustomRaidTimes: All map raid times changed to ${masterTimeMinutes} minutes.`);
        }
    }
}

module.exports = { mod: new CustomRaidTimes() };