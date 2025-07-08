import { ILocationBase } from "@spt/models/eft/common/ILocationBase";
import { IGetRaidTimeRequest } from "@spt/models/eft/game/IGetRaidTimeRequest";
import type { IPostDBLoadMod } from "@spt/models/external/IPostDBLoadMod";
import type { IPreSptLoadMod } from "@spt/models/external/IPreSptLoadMod";
import { IRaidChanges } from "@spt/models/spt/location/IRaidChanges";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { DatabaseService } from "@spt/services/DatabaseService";
import { RaidTimeAdjustmentService } from "@spt/services/RaidTimeAdjustmentService";
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
    private logger: ILogger;
    private config: Configuration | null = null;
    private container: DependencyContainer;
    private configServer: ConfigServer;

    /**
     * Handle loading the configuration file and registering our custom CustomRaidTimesMatchEnd route.
     * Runs before the database is loaded.
     */
    public preSptLoad(container: DependencyContainer): void {
        this.container = container;
        this.logger = container.resolve<ILogger>("WinstonLogger");
        this.configServer = new ConfigServer();

        // Load and validate the configuration file.
        try {
            this.config = this.configServer.loadConfig().validateConfig().getConfig();
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
                    url: "/client/match/local/end",
                    action: async (url, info, sessionId, output) => {
                        if (this.config?.general?.debug) {
                            this.logger.log(
                                "CustomRaidTimes: CustomRaidTimesMatchEnd route has been triggered.",
                                "gray",
                            );
                        }

                        this.initializer(container);

                        return output;
                    },
                },
            ],
            "CustomRaidTimesMatchEnd",
        );

        // Register a replacement for the RaidTimeAdjustmentService getRaidAdjustments method if the configuration is
        // set to override the scav raid times as well.
        if (this.config?.raidTimes?.overrideScav) {
            container.afterResolution(
                "RaidTimeAdjustmentService",
                (_t, result: RaidTimeAdjustmentService) => {
                    result.getRaidAdjustments = (sessionId: string, request: IGetRaidTimeRequest): IRaidChanges => {
                        return this.getRaidAdjustments(sessionId, request);
                    };
                },
                { frequency: "Always" },
            );
        }
    }

    /**
     * This method is used to override the default getRaidAdjustments method. This is only used if the `overrideScav`
     * setting in the configuration file is set to true. If this is not done, the user's custom times will be modified
     * from the times set in the configuration file possibly causing confusion.
     *
     * @override @spt/services/RaidTimeAdjustmentService.getRaidAdjustments
     */
    public getRaidAdjustments(sessionId: string, request: IGetRaidTimeRequest): IRaidChanges {
        const databaseService = this.container.resolve<DatabaseService>("DatabaseService");

        const globals = databaseService.getGlobals();
        const mapBase: ILocationBase = databaseService.getLocation(request.Location.toLowerCase()).base;
        const baseEscapeTimeMinutes = mapBase.EscapeTimeLimit;

        // Prep result object to return
        const result: IRaidChanges = {
            newSurviveTimeSeconds: globals.config.exp.match_end.survived_seconds_requirement,
            originalSurvivalTimeSeconds: globals.config.exp.match_end.survived_seconds_requirement,
            dynamicLootPercent: 100,
            staticLootPercent: 100,
            simulatedRaidStartSeconds: 0,
            raidTimeMinutes: baseEscapeTimeMinutes,
            exitChanges: [],
        };

        this.logger.log("CustomRaidTimes: The `getRaidAdjustments` override has been triggered.", "cyan");

        return result; // Return here regardless of side.
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

        // Load a fresh copy of the configuration so we can regenerate random times.
        this.config = this.configServer.loadConfig().validateConfig().getConfig();
    }
}

module.exports = { mod: new CustomRaidTimes() };
