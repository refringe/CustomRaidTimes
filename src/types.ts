export interface Configuration {
    general: General;
    raidTimes: RaidTimes;
    trainSchedule: TrainSchedule;
}

export interface General {
    enabled: boolean;
    debug: boolean;
}

export interface RaidTimes {
    overrideAll: boolean;
    override: number | TimeSetting[];
    customTimes: CustomTimes;
    overrideScav: boolean;
}

export interface TimeSetting {
    minutes: number | { min: number; max: number };
    weight: number | { min: number; max: number };
}

export interface CustomTimes {
    [location: string]: number | TimeSetting[];
}

export interface TrainSchedule {
    auto: boolean;
    static: {
        arriveEarliestMinutes: number;
        arriveLatestMinutes: number;
        trainWaitSeconds: number;
    };
}
