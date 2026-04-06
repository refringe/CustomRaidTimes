using System.Text.Json;
using System.Text.Json.Serialization;

namespace CustomRaidTimes.Models;

public record Configuration
{
    [JsonPropertyName("general")]
    public required GeneralConfig General { get; init; }

    [JsonPropertyName("raidTimes")]
    public required RaidTimesConfig RaidTimes { get; init; }

    [JsonPropertyName("trainSchedule")]
    public required TrainScheduleConfig TrainSchedule { get; init; }
}

public record GeneralConfig
{
    [JsonPropertyName("enabled")]
    public bool Enabled { get; init; }

    [JsonPropertyName("debug")]
    public bool Debug { get; init; }
}

public record RaidTimesConfig
{
    [JsonPropertyName("overrideAll")]
    public bool OverrideAll { get; init; }

    [JsonPropertyName("override")]
    public JsonElement Override { get; init; }

    [JsonPropertyName("customTimes")]
    public required CustomTimesConfig CustomTimes { get; init; }

    [JsonPropertyName("overrideScav")]
    public bool OverrideScav { get; init; }
}

public record CustomTimesConfig
{
    [JsonPropertyName("customs")]
    public JsonElement Customs { get; init; }

    [JsonPropertyName("factoryDay")]
    public JsonElement FactoryDay { get; init; }

    [JsonPropertyName("factoryNight")]
    public JsonElement FactoryNight { get; init; }

    [JsonPropertyName("interchange")]
    public JsonElement Interchange { get; init; }

    [JsonPropertyName("laboratory")]
    public JsonElement Laboratory { get; init; }

    [JsonPropertyName("lighthouse")]
    public JsonElement Lighthouse { get; init; }

    [JsonPropertyName("reserve")]
    public JsonElement Reserve { get; init; }

    [JsonPropertyName("groundZero")]
    public JsonElement GroundZero { get; init; }

    [JsonPropertyName("groundZeroHigh")]
    public JsonElement GroundZeroHigh { get; init; }

    [JsonPropertyName("shoreline")]
    public JsonElement Shoreline { get; init; }

    [JsonPropertyName("streets")]
    public JsonElement Streets { get; init; }

    [JsonPropertyName("woods")]
    public JsonElement Woods { get; init; }

    [JsonPropertyName("labyrinth")]
    public JsonElement Labyrinth { get; init; }
}

public record TrainScheduleConfig
{
    [JsonPropertyName("auto")]
    public bool Auto { get; init; }

    [JsonPropertyName("static")]
    public required StaticTrainConfig Static { get; init; }
}

public record StaticTrainConfig
{
    [JsonPropertyName("arriveEarliestMinutes")]
    public double ArriveEarliestMinutes { get; init; }

    [JsonPropertyName("arriveLatestMinutes")]
    public double ArriveLatestMinutes { get; init; }

    [JsonPropertyName("trainWaitSeconds")]
    public double TrainWaitSeconds { get; init; }
}
