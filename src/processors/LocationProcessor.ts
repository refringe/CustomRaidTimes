import type { ILocations } from "@spt/models/spt/server/ILocations";
import type { DatabaseServer } from "@spt/servers/DatabaseServer";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { RaidTimeAdjuster } from "../adjusters/RaidTimeAdjuster";
import { TrainTimeAdjuster } from "../adjusters/TrainTimeAdjuster";
import { DependencyContainer } from "tsyringe";
import type { Configuration } from "../types";

/**
 * LocationProcessor class.
 *
 * Handles processing of different game locations. This class currently adjusts various parameters of a location.
 */
export class LocationProcessor {
    private container: DependencyContainer;
    private logger: ILogger;
    private locations: ILocations;

    /**
     * Mapping of internal location names to their respective configuration and human-readable names.
     */
    public static readonly locationNames = {
        /* eslint-disable @typescript-eslint/naming-convention */
        bigmap: { config: "customs", human: "Customs" },
        factory4_day: { config: "factoryDay", human: "Factory (Day)" },
        factory4_night: { config: "factoryNight", human: "Factory (Night)" },
        interchange: { config: "interchange", human: "Interchange" },
        laboratory: { config: "laboratory", human: "Laboratory" },
        lighthouse: { config: "lighthouse", human: "Lighthouse" },
        rezervbase: { config: "reserve", human: "Reserve" },
        sandbox: { config: "groundZero", human: "Ground Zero" },
        sandbox_high: { config: "groundZeroHigh", human: "Ground Zero High" },
        shoreline: { config: "shoreline", human: "Shoreline" },
        tarkovstreets: { config: "streets", human: "Streets of Tarkov" },
        woods: { config: "woods", human: "Woods" },
        /* eslint-enable @typescript-eslint/naming-convention */
    };

    /**
     * Constructs a new instance of the `LocationProcessor` class.
     */
    constructor(container: DependencyContainer) {
        this.container = container;
        this.logger = container.resolve<ILogger>("WinstonLogger");
        this.locations = container.resolve<DatabaseServer>("DatabaseServer").getTables().locations;
    }

    /**
     * Processes the enabled locations by adjusting raid and train times.
     */
    public processLocations(config: Configuration): void {
        const enabledLocations = Object.keys(LocationProcessor.locationNames);
        for (const locationName of enabledLocations) {
            const location = this.locations[locationName].base;
            new RaidTimeAdjuster(this.container, location).adjust(config);
            new TrainTimeAdjuster(this.container, location).adjust(config);
        }

        this.logger.log(
            "CustomRaidTimes: Raid times have been successfully adjusted according to the configuration.",
            "cyan"
        );
    }
}
