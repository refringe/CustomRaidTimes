import type { JSONSchema7 } from "json-schema";

// biome-ignore lint/complexity/noStaticOnlyClass: <explanation>
export class ConfigSchema {
    /* eslint-disable @typescript-eslint/naming-convention */
    public static readonly schema: JSONSchema7 = {
        $schema: "http://json-schema.org/draft-07/schema#",
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
                        oneOf: [
                            { type: "integer" },
                            {
                                type: "array",
                                items: { $ref: "#/definitions/timeWeight" },
                            },
                        ],
                    },
                    customTimes: {
                        type: "object",
                        additionalProperties: {
                            oneOf: [
                                { type: "integer" },
                                {
                                    type: "array",
                                    items: { $ref: "#/definitions/timeWeight" },
                                },
                            ],
                        },
                    },
                },
                required: ["overrideAll", "override", "customTimes"],
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
        required: ["general", "raidTimes", "trainSchedule"],
        definitions: {
            timeWeight: {
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
                required: ["minutes", "weight"],
            },
        },
    };
    /* eslint-enable @typescript-eslint/naming-convention */
}
