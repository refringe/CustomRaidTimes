import type { Wave } from "@spt-aki/models/eft/common/ILocationBase";

export interface Configuration {
    general: General;
    raidTimes: RaidTimes;
    botSpawn: BotSpawn;
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
}

export interface TimeSetting {
    minutes: number | { min: number; max: number };
    weight: number | { min: number; max: number };
}

export interface CustomTimes {
    [location: string]: number | TimeSetting[];
}

export interface BotSpawn {
    adjustWaves: boolean;
    force: boolean;
    maximumBots: number;
    wavesPerGroup: { max: number; min: number };
    groupGapMinutes: { max: number; min: number };
}

export interface TrainSchedule {
    auto: boolean;
    static: {
        arriveEarliestMinutes: number;
        arriveLatestMinutes: number;
        trainWaitSeconds: number;
    };
}

export interface IncompatibleModEntry {
    mods: string[];
    config: string;
    value: boolean;
}

export type ExtendedWave = Wave & {
    group: number;
};

export interface GroupTimeParams {
    min: number;
    max: number;
    offset: number;
    middle: number;
}
