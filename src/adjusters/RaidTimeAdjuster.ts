import type { ILocationBase } from "@spt-aki/models/eft/common/ILocationBase";
import { CustomRaidTimes } from "../CustomRaidTimes";
import { LocationProcessor } from "../processors/LocationProcessor";

/**
 * RaidTimeAdjuster class.
 *
 * Handles the logic needed to set a new raid time.
 */
export class RaidTimeAdjuster {
    private location: ILocationBase;
    private locationName: { config: string; human: string };

    constructor(location: ILocationBase) {
        this.location = location;
        this.locationName = LocationProcessor.locationNames[location.Id.toString().toLowerCase()];
    }

    /**
     * Adjusts the raid time of the location.
     */
    public adjust(): void {
        const originalTime = this.location.EscapeTimeLimit;

        if (CustomRaidTimes.config.raidTimes.overrideAll) {
            this.location.EscapeTimeLimit = Number(CustomRaidTimes.config.raidTimes.override);
        } else {
            const customTime = CustomRaidTimes.config.raidTimes.customTimes[this.locationName.config];
            this.location.EscapeTimeLimit = Number(customTime);
        }

        if (CustomRaidTimes.config.general.debug && this.location.EscapeTimeLimit !== originalTime) {
            CustomRaidTimes.logger.log(
                `CustomRaidTimes: ${this.locationName.human} raid time change from ${originalTime} minutes to ${this.location.EscapeTimeLimit} minutes.`,
                "gray"
            );
        }
    }
}
