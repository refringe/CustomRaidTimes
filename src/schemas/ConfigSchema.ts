import { JSONSchema7 } from "json-schema";

export class ConfigSchema {
    /* eslint-disable @typescript-eslint/naming-convention */
    public static readonly schema: JSONSchema7 = {
        type: "object",
        properties: {
            general: {
                type: "object",
                properties: {
                    enabled: { type: "boolean" },
                    debug: { type: "boolean" },
                },
                required: ["enabled", "debug"],
            },
            raidTimes: {
                type: "object",
                properties: {
                    overrideAll: { type: "boolean" },
                    override: {
                        type: "array",
                        items: { $ref: "#/definitions/customTime" },
                    },
                    customTimes: {
                        type: "object",
                        properties: {
                            customs: { $ref: "#/definitions/customTime" },
                            factoryDay: { $ref: "#/definitions/customTime" },
                            factoryNight: { $ref: "#/definitions/customTime" },
                            interchange: { $ref: "#/definitions/customTime" },
                            laboratory: { $ref: "#/definitions/customTime" },
                            lighthouse: { $ref: "#/definitions/customTime" },
                            reserve: { $ref: "#/definitions/customTime" },
                            shoreline: { $ref: "#/definitions/customTime" },
                            streets: { $ref: "#/definitions/customTime" },
                            woods: { $ref: "#/definitions/customTime" },
                        },
                    },
                },
                required: ["overrideAll", "override"],
            },
            botSpawn: {
                type: "object",
                properties: {
                    adjustWaves: { type: "boolean" },
                    force: { type: "boolean" },
                    maximumBots: { type: "integer" },
                    wavesPerGroup: {
                        type: "object",
                        properties: {
                            max: { type: "integer" },
                            min: { type: "integer" },
                        },
                        required: ["max", "min"],
                    },
                    groupGapMinutes: {
                        type: "object",
                        properties: {
                            max: { type: "integer" },
                            min: { type: "integer" },
                        },
                        required: ["max", "min"],
                    },
                },
                required: ["adjustWaves", "force", "maximumBots", "wavesPerGroup", "groupGapMinutes"],
            },
            trainSchedule: {
                type: "object",
                properties: {
                    auto: { type: "boolean" },
                    static: {
                        type: "object",
                        properties: {
                            arriveEarliestMinutes: { type: "integer" },
                            arriveLatestMinutes: { type: "integer" },
                            trainWaitSeconds: { type: "integer" },
                        },
                        required: ["arriveEarliestMinutes", "arriveLatestMinutes", "trainWaitSeconds"],
                    },
                },
                required: ["auto", "static"],
            },
        },
        required: ["general", "raidTimes", "botSpawn", "trainSchedule"],
        definitions: {
            customTime: {
                oneOf: [
                    { type: "integer" },
                    {
                        type: "object",
                        properties: {
                            minutes: {
                                oneOf: [
                                    { type: "integer" },
                                    {
                                        type: "object",
                                        properties: {
                                            min: { type: "integer" },
                                            max: { type: "integer" },
                                        },
                                        required: ["min", "max"],
                                    },
                                ],
                            },
                            weight: {
                                oneOf: [
                                    { type: "integer" },
                                    {
                                        type: "object",
                                        properties: {
                                            min: { type: "integer" },
                                            max: { type: "integer" },
                                        },
                                        required: ["min", "max"],
                                    },
                                ],
                            },
                        },
                        additionalProperties: false,
                    },
                ],
            },
        },
    };
    /* eslint-enable @typescript-eslint/naming-convention */
}
