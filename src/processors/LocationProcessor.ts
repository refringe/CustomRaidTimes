import type { ILocations } from "@spt-aki/models/spt/server/ILocations";
import type { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { CustomRaidTimes } from "../CustomRaidTimes";
import { RaidTimeAdjuster } from "../adjusters/RaidTimeAdjuster";
import { TrainTimeAdjuster } from "../adjusters/TrainTimeAdjuster";

/**
 * LocationProcessor class.
 *
 * Handles processing of different game locations. This class currently adjusts various parameters of a location
 * including raid times, spawn waves, and train times.
 */
export class LocationProcessor {
    private locations: ILocations;

    /**
     * Mapping of internal location names to their respective configuration and human-readable names.
     */
    /* eslint-disable @typescript-eslint/naming-convention */
    public static readonly locationNames = {
        bigmap: { config: "customs", human: "Customs" },
        factory4_day: { config: "factoryDay", human: "Factory (Day)" },
        factory4_night: { config: "factoryNight", human: "Factory (Night)" },
        interchange: { config: "interchange", human: "Interchange" },
        laboratory: { config: "laboratory", human: "Laboratory" },
        lighthouse: { config: "lighthouse", human: "Lighthouse" },
        rezervbase: { config: "reserve", human: "Reserve" },
        sandbox: { config: "groundZero", human: "Ground Zero" },
        shoreline: { config: "shoreline", human: "Shoreline" },
        tarkovstreets: { config: "streets", human: "Streets of Tarkov" },
        woods: { config: "woods", human: "Woods" },
    };
    /* eslint-enable @typescript-eslint/naming-convention */

    /**
     * Constructs a new instance of the `LocationProcessor` class.
     */
    constructor() {
        this.locations = CustomRaidTimes.container.resolve<DatabaseServer>("DatabaseServer").getTables().locations;
    }

    /**
     * Processes the enabled locations by adjusting raid times, spawn waves, and train times.
     */
    public processLocations(): void {
        const enabledLocations = Object.keys(LocationProcessor.locationNames);
        for (const locationName of enabledLocations) {
            const location = this.locations[locationName].base;
            new RaidTimeAdjuster(location).adjust();
            new TrainTimeAdjuster(location).adjust();
        }
    }
}
