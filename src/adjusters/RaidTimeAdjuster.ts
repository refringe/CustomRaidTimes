import type { ILocationBase } from "@spt/models/eft/common/ILocationBase";
import { LocationProcessor } from "../processors/LocationProcessor";
import type { Configuration } from "../types";
import { DependencyContainer } from "tsyringe";
import type { ILogger } from "@spt/models/spt/utils/ILogger";

/**
 * RaidTimeAdjuster class.
 *
 * Handles the logic needed to set a new raid time.
 */
export class RaidTimeAdjuster {
    public logger: ILogger;
    private location: ILocationBase;
    private locationName: { config: string; human: string };

    constructor(container: DependencyContainer, location: ILocationBase) {
        this.logger = container.resolve<ILogger>("WinstonLogger");
        this.location = location;
        this.locationName = LocationProcessor.locationNames[location.Id.toString().toLowerCase()];
    }

    /**
     * Adjusts the raid time of the location.
     */
    public adjust(config: Configuration): void {
        const originalTime = this.location.EscapeTimeLimit;

        if (config.raidTimes.overrideAll) {
            this.location.EscapeTimeLimit = Number(config.raidTimes.override);
        } else {
            const customTime = config.raidTimes.customTimes[this.locationName.config];
            this.location.EscapeTimeLimit = Number(customTime);
        }

        if (config.general.debug && this.location.EscapeTimeLimit !== originalTime) {
            this.logger.log(
                `CustomRaidTimes: ${this.locationName.human} raid time change from ${originalTime} minutes to ${this.location.EscapeTimeLimit} minutes.`,
                "gray"
            );
        }
    }
}
