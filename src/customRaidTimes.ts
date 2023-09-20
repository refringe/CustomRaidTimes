import { IPostDBLoadMod } from "@spt-aki/models/external/IPostDBLoadMod";
import { IPreAkiLoadMod } from "@spt-aki/models/external/IPreAkiLoadMod";
import { StaticRouterModService } from "@spt-aki/services/mod/staticRouter/StaticRouterModService";
import { DependencyContainer } from "tsyringe";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { adjustRaids } from "./raids";
import { ConfigServer } from "./servers/ConfigServer";
import { Configuration } from "./types";

/**
 * CustomRaidTimes mod.
 */
class CustomRaidTimes implements IPostDBLoadMod, IPreAkiLoadMod {
    public static container: DependencyContainer;
    public static logger: ILogger;
    public static config: Configuration | null = null;

    /**
     * Handle loading the configuration file and registering our custom CustomRaidTimesMatchEnd route.
     * Runs before the database is loaded.
     */
    public async preAkiLoad(container: DependencyContainer): Promise<void> {
        CustomRaidTimes.container = container;

        // Resolve the logger and save it to the static logger property for simple access.
        CustomRaidTimes.logger = container.resolve<ILogger>("WinstonLogger");

        // Load and validate the configuration file, saving it to the static config property for simple access.
        try {
            CustomRaidTimes.config = new ConfigServer().loadConfig().validateConfig().getConfig();
        } catch (error: any) {
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
                        if (CustomRaidTimes.config!.general.debug) {
                            CustomRaidTimes.logger.log(
                                "CustomRaidTimes: CustomRaidTimesMatchEnd route has been triggered.",
                                "gray"
                            );
                        }

                        adjustRaids(container, CustomRaidTimes.config!);
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
    public async postDBLoad(container: DependencyContainer): Promise<void> {
        // If the configuration is null at this point we can stop here. This will happen if the configuration file
        // failed to load, failed to validate, or if the mod is disabled in the configuration file.
        if (CustomRaidTimes.config === null) {
            return;
        }

        // Modify the raids.
        new AdjustRaidTimes();
    }
}

module.exports = { mod: new CustomRaidTimes() };
