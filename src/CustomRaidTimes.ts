import type { IPostDBLoadMod } from "@spt/models/external/IPostDBLoadMod";
import type { IPreSptLoadMod } from "@spt/models/external/IPreSptLoadMod";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import type { StaticRouterModService } from "@spt/services/mod/staticRouter/StaticRouterModService";
import { DependencyContainer } from "tsyringe";
import { LocationProcessor } from "./processors/LocationProcessor";
import { RaidTimeProcessor } from "./processors/RaidTimeProcessor";
import { ConfigServer } from "./servers/ConfigServer";
import type { Configuration } from "./types";

/**
 * CustomRaidTimes mod.
 */
class CustomRaidTimes implements IPostDBLoadMod, IPreSptLoadMod {
    public logger: ILogger;
    public config: Configuration | null = null;

    /**
     * Handle loading the configuration file and registering our custom CustomRaidTimesMatchEnd route.
     * Runs before the database is loaded.
     */
    public preSptLoad(container: DependencyContainer): void {
        // Resolve the logger.
        this.logger = container.resolve<ILogger>("WinstonLogger");

        // Load and validate the configuration file.
        try {
            this.config = new ConfigServer().loadConfig().validateConfig().getConfig();
        } catch (error) {
            this.config = null; // Set the config to null so we know it's failed to load or validate.
            this.logger.log(`CustomRaidTimes: ${error.message}`, "red");
        }

        // Set a flag so we know that we shouldn't continue when the postDBLoad method fires... just setting the config
        // back to null should do the trick. Use optional chaining because we have not yet checked if the config is
        // loaded and valid yet.
        if (this.config?.general?.enabled === false) {
            this.config = null;
            this.logger.log("CustomRaidTimes is disabled in the config file.", "red");
        }

        // If the configuration is null at this point we can stop here.
        if (this.config === null) {
            return;
        }

        // Register a static route for the end of a raid so that the raid times can be readjusted.
        const staticRouterModService = container.resolve<StaticRouterModService>("StaticRouterModService");
        staticRouterModService.registerStaticRouter(
            "CustomRaidTimesMatchEnd",
            [
                {
                    url: "/client/match/offline/end",
                    action: async (url, info, sessionId, output) => {
                        if (this.config?.general?.debug) {
                            this.logger.log(
                                "CustomRaidTimes: CustomRaidTimesMatchEnd route has been triggered.",
                                "gray"
                            );
                        }

                        this.initializer(container);

                        return output;
                    },
                },
            ],
            "CustomRaidTimesMatchEnd"
        );
    }

    /**
     * Adjust the raids on server start, once the database has been loaded.
     */
    public postDBLoad(container: DependencyContainer): void {
        // If the configuration is null at this point we can stop here. This will happen if the configuration file
        // failed to load, failed to validate, or if the mod is disabled in the configuration file.
        if (this.config === null) {
            return;
        }

        this.initializer(container);
    }

    private initializer(container: DependencyContainer): void {
        // Process the raid time configuration options and return the calculated times.
        // This will be run after database load, and after every raid.
        this.config.raidTimes = new RaidTimeProcessor(container).processTimes(this.config.raidTimes).getTimes();

        // Engage!
        new LocationProcessor(container).processLocations(this.config);
    }
}

module.exports = { mod: new CustomRaidTimes() };
