import { select } from "weighted";
import { DependencyContainer } from "tsyringe";
import type { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import type { IPostDBLoadMod } from "@spt-aki/models/external/IPostDBLoadMod";
import type { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import type {StaticRouterModService} from "@spt-aki/services/mod/staticRouter/StaticRouterModService";

class CustomRaidTimes implements IPostDBLoadMod
{
    private config = require("../config/config.json");

    public postDBLoad(container: DependencyContainer): void
    {
        // Get the logger from the server container.
        const logger = container.resolve<ILogger>("WinstonLogger");

        // Check to see if the mod is enabled.
        const enabled:boolean = this.config.mod_enabled;
        if (!enabled)
        {
            logger.info("CustomRaidTimes is disabled in the config file. No changes to raid times will be made.");
            return;
        }

        // Get the router service from the server container.
        const staticRouterModService = container.resolve<StaticRouterModService>("StaticRouterModService");

        // Recalculate the raid times at the end of every raid.
        staticRouterModService.registerStaticRouter(
            "CustomRaidTimes", [{
                url: "/client/match/offline/end",
                action: (url, info, sessionId, output) =>
                {
                    this.generateCustomRaidTimes(container);
                    return output;
                }
            }], "aki"
        );

        // Recalculate the raid times when the server starts.
        this.generateCustomRaidTimes(container);
    }

    private generateCustomRaidTimes(container: DependencyContainer): void
    {
        // Get the logger from the server container.
        const logger = container.resolve<ILogger>("WinstonLogger");

        // Are we loud?
        const debug:boolean = this.config.debug;

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
                if (debug)
                    logger.info(`CustomRaidTimes: Location '${location}' raid time changed to ${newRaidTime} minutes.`);
            }

            // Engage.
            locations[location].base.EscapeTimeLimit = newRaidTime;
        }

        if (masterTimeOverride)
        {
            if (debug)
                logger.info(`CustomRaidTimes: Map raid times changed to ${masterTimeMinutes} minutes.`);
            else
                logger.info("CustomRaidTimes: Map raid times updated.");
        }
    }

    private resolveTimeSettings(settings): number
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

    private locationNameLookup(location:string): string
    {
        // We named the locations in the config file nicer than the database names...
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
}

module.exports = { mod: new CustomRaidTimes() };
