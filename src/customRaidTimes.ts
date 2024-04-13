import type { IPostDBLoadMod } from "@spt-aki/models/external/IPostDBLoadMod";
import type { IPreAkiLoadMod } from "@spt-aki/models/external/IPreAkiLoadMod";
import type { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import type { StaticRouterModService } from "@spt-aki/services/mod/staticRouter/StaticRouterModService";
import { DependencyContainer } from "tsyringe";
import { LocationProcessor } from "./processors/LocationProcessor";
import { RaidTimeProcessor } from "./processors/RaidTimeProcessor";
import { ConfigServer } from "./servers/ConfigServer";
import type { Configuration } from "./types";

/**
 * CustomRaidTimes mod.
 */
export class CustomRaidTimes implements IPostDBLoadMod, IPreAkiLoadMod {
    public static container: DependencyContainer;
    public static logger: ILogger;
    public static config: Configuration | null = null;

    /**
     * Handle loading the configuration file and registering our custom CustomRaidTimesMatchEnd route.
     * Runs before the database is loaded.
     */
    public preAkiLoad(container: DependencyContainer): void {
        CustomRaidTimes.container = container;

        // Resolve the logger and save it to the static logger property for simple access.
        CustomRaidTimes.logger = container.resolve<ILogger>("WinstonLogger");

        // Load and validate the configuration file, saving it to the static config property for simple access.
        try {
            CustomRaidTimes.config = new ConfigServer().loadConfig().validateConfig().getConfig();
        } catch (error) {
            CustomRaidTimes.config = null; // Set the config to null so we know it's failed to load or validate.
            CustomRaidTimes.logger.log(`CustomRaidTimes: ${error.message}`, "red");
        }

        // Set a flag so we know that we shouldn't continue when the postDBLoad method fires... just setting the config
        // back to null should do the trick. Use optional chaining because we have not yet checked if the config is
        // loaded and valid yet.
        if (CustomRaidTimes.config?.general?.enabled === false) {
            CustomRaidTimes.config = null;
            CustomRaidTimes.logger.log("CustomRaidTimes is disabled in the config file.", "red");
        }

        // If the configuration is null at this point we can stop here.
        if (CustomRaidTimes.config === null) {
            return;
        }

        // Register a static route for the end of a raid so that the raid times can be readjusted.
        const staticRouterModService = container.resolve<StaticRouterModService>("StaticRouterModService");
        staticRouterModService.registerStaticRouter(
            "CustomRaidTimesMatchEnd",
            [
                {
                    url: "/client/match/offline/end",
                    action: (url, info, sessionId, output) => {
                        if (CustomRaidTimes.config?.general?.debug) {
                            CustomRaidTimes.logger.log(
                                "CustomRaidTimes: CustomRaidTimesMatchEnd route has been triggered.",
                                "gray"
                            );
                        }

                        this.initializer();

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
        if (CustomRaidTimes.config === null) {
            return;
        }

        this.initializer();
    }

    private initializer(): void {
        // Process the raid time configuration options and return the calculated times. This will be run after database
        // load, and after every raid.
        CustomRaidTimes.config.raidTimes = new RaidTimeProcessor(CustomRaidTimes.config.raidTimes)
            .processTimes()
            .getTimes();

        // Engage!
        new LocationProcessor().processLocations();
    }
}

module.exports = { mod: new CustomRaidTimes() };
