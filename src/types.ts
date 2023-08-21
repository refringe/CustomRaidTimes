import type { Wave } from '@spt-aki/models/eft/common/ILocationBase';

export interface Configuration {
    general: General;
    raidTimes: RaidTimes;
    botSpawn: BotSpawn;
}

export interface General {
    enabled: boolean;
    debug: boolean;
}

export interface RaidTimes {
    overrideAll: boolean;
    override: TimeSetting[];
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
    maximumBots: number;
    wavesPerGroup: { max: number; min: number };
    groupGapMinutes: { max: number; min: number };
}

export type ExtendedWave = Wave & {
    group: number;
};
