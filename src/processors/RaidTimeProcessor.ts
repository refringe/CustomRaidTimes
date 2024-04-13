import type { RandomUtil } from "@spt-aki/utils/RandomUtil";
import { select } from "weighted";
import { CustomRaidTimes } from "../CustomRaidTimes";
import type { RaidTimes, TimeSetting } from "../types";

/**
 * RaidTimeProcessor class.
 *
 * This class is responsible for processing and resolving raid times based on the given configuration. It can resolve
 * both the `override` and `customTimes` properties to simple numbers for easier use downstream.
 */
export class RaidTimeProcessor {
    private randomUtil: RandomUtil;
    private raidTimes: RaidTimes;
    private resolvedRaidTimes: RaidTimes = {
        overrideAll: false,
        override: 0,
        customTimes: {},
    };

    /**
     * Constructor.
     *
     * @param {RaidTimes} raidTimes - The raid times from the configuration.
     */
    constructor(raidTimes: RaidTimes) {
        this.raidTimes = raidTimes;
        this.randomUtil = CustomRaidTimes.container.resolve<RandomUtil>("RandomUtil");
    }

    /**
     * Process and resolve the raid times.
     *
     * @returns {RaidTimeProcessor} - Returns the instance for chaining.
     */
    public processTimes(): RaidTimeProcessor {
        // Resolve the 'override' raid time
        this.resolvedRaidTimes.override = this.resolveTimeSettings(this.raidTimes.override);

        // Copy 'overrideAll' value from the original configuration
        this.resolvedRaidTimes.overrideAll = this.raidTimes.overrideAll;

        // Resolve 'customTimes' for each location
        for (const [location, timeSetting] of Object.entries(this.raidTimes.customTimes)) {
            this.resolvedRaidTimes.customTimes[location] = this.resolveTimeSettings(
                timeSetting as TimeSetting[] | number
            );
        }

        return this;
    }

    /**
     * Resolve time settings to a single number.
     *
     * @param {TimeSetting[] | number} settings - The time settings to resolve.
     * @returns {number} - The resolved time in minutes.
     */
    private resolveTimeSettings(settings: TimeSetting[] | number): number {
        if (typeof settings === "number") {
            return settings;
        }

        // Generate weighted items for selection
        const weightedItems = settings.reduce<Record<number, number>[]>((acc, setting) => {
            const minutes = "minutes" in setting ? this.resolveValue(setting.minutes) : 0;
            const weight = "weight" in setting ? this.resolveValue(setting.weight) : 1;

            if ("minutes" in setting || "weight" in setting) {
                acc.push({ [minutes]: weight });
            }

            return acc;
        }, []);

        return Number(Object.keys(select(weightedItems))[0]);
    }

    /**
     * Resolve a value which can be either a number or a range.
     *
     * @param {number | { min: number; max: number }} value - The value to resolve.
     * @returns {number} - The resolved value.
     */
    private resolveValue(value: number | { min: number; max: number }): number {
        return typeof value === "object" ? this.randomUtil.getInt(value.min, value.max) : value;
    }

    /**
     * Get the resolved raid times.
     *
     * @returns {RaidTimes} - The resolved raid times.
     */
    public getTimes(): RaidTimes {
        return this.resolvedRaidTimes;
    }
}
