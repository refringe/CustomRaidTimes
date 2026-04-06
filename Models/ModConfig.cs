using System.Text.Json;
using System.Text.Json.Nodes;

namespace CustomRaidTimes.Models;

public class ModConfig
{
    public GeneralSettings General { get; set; } = new();
    public RaidTimesSettings RaidTimes { get; set; } = new();
    public TrainScheduleSettings TrainSchedule { get; set; } = new();

    /// <summary>
    /// Maps SPT database location keys to (config JSON key, human-readable label).
    /// Single source of truth for all location references across the mod and web UI.
    /// </summary>
    public static readonly Dictionary<string, (string ConfigKey, string Label)> LocationMap = new()
    {
        ["Bigmap"] = ("customs", "Customs"),
        ["Factory4Day"] = ("factoryDay", "Factory (Day)"),
        ["Factory4Night"] = ("factoryNight", "Factory (Night)"),
        ["Interchange"] = ("interchange", "Interchange"),
        ["Laboratory"] = ("laboratory", "Laboratory"),
        ["Labyrinth"] = ("labyrinth", "Labyrinth"),
        ["Lighthouse"] = ("lighthouse", "Lighthouse"),
        ["RezervBase"] = ("reserve", "Reserve"),
        ["Sandbox"] = ("groundZero", "Ground Zero"),
        ["SandboxHigh"] = ("groundZeroHigh", "Ground Zero (High-level)"),
        ["Shoreline"] = ("shoreline", "Shoreline"),
        ["TarkovStreets"] = ("streets", "Streets of Tarkov"),
        ["Woods"] = ("woods", "Woods"),
    };

    public static ModConfig FromJson(string json)
    {
        var options = new JsonDocumentOptions { CommentHandling = JsonCommentHandling.Skip };
        using var doc = JsonDocument.Parse(json, options);
        var root = doc.RootElement;

        var config = new ModConfig();

        if (root.TryGetProperty("general", out var general))
        {
            config.General.Enabled = general.TryGetProperty("enabled", out var e) && e.ValueKind == JsonValueKind.True;
            config.General.Debug = general.TryGetProperty("debug", out var d) && d.ValueKind == JsonValueKind.True;
        }

        if (root.TryGetProperty("raidTimes", out var raidTimes))
        {
            config.RaidTimes.OverrideAll = raidTimes.TryGetProperty("overrideAll", out var oa) && oa.ValueKind == JsonValueKind.True;
            config.RaidTimes.OverrideScav = raidTimes.TryGetProperty("overrideScav", out var os) && os.ValueKind == JsonValueKind.True;

            if (raidTimes.TryGetProperty("override", out var overrideEl))
            {
                config.RaidTimes.Override = TimeSetting.FromJsonElement(overrideEl);
            }

            if (raidTimes.TryGetProperty("customTimes", out var customTimes))
            {
                foreach (var (_, (configKey, _)) in LocationMap)
                {
                    if (customTimes.TryGetProperty(configKey, out var timeEl))
                    {
                        config.RaidTimes.CustomTimes[configKey] = TimeSetting.FromJsonElement(timeEl);
                    }
                }
            }
        }

        if (root.TryGetProperty("trainSchedule", out var trainSchedule))
        {
            // Default to true if the "auto" property is missing from the config
            config.TrainSchedule.Auto = !trainSchedule.TryGetProperty("auto", out var a) || a.ValueKind == JsonValueKind.True;

            if (trainSchedule.TryGetProperty("static", out var s))
            {
                if (s.TryGetProperty("arriveEarliestMinutes", out var ae) && ae.ValueKind == JsonValueKind.Number)
                {
                    config.TrainSchedule.Static.ArriveEarliestMinutes = ae.GetInt32();
                }
                if (s.TryGetProperty("arriveLatestMinutes", out var al) && al.ValueKind == JsonValueKind.Number)
                {
                    config.TrainSchedule.Static.ArriveLatestMinutes = al.GetInt32();
                }
                if (s.TryGetProperty("trainWaitSeconds", out var tw) && tw.ValueKind == JsonValueKind.Number)
                {
                    config.TrainSchedule.Static.TrainWaitSeconds = tw.GetInt32();
                }
            }
        }

        return config;
    }

    public string ToJson()
    {
        var root = new JsonObject
        {
            ["general"] = new JsonObject
            {
                ["enabled"] = General.Enabled,
                ["debug"] = General.Debug
            },
            ["raidTimes"] = new JsonObject
            {
                ["overrideAll"] = RaidTimes.OverrideAll,
                ["override"] = RaidTimes.Override.ToJsonNode(),
                ["customTimes"] = BuildCustomTimesNode(),
                ["overrideScav"] = RaidTimes.OverrideScav
            },
            ["trainSchedule"] = new JsonObject
            {
                ["auto"] = TrainSchedule.Auto,
                ["static"] = new JsonObject
                {
                    ["arriveEarliestMinutes"] = TrainSchedule.Static.ArriveEarliestMinutes,
                    ["arriveLatestMinutes"] = TrainSchedule.Static.ArriveLatestMinutes,
                    ["trainWaitSeconds"] = TrainSchedule.Static.TrainWaitSeconds
                }
            }
        };

        var options = new JsonSerializerOptions { WriteIndented = true };
        return root.ToJsonString(options);
    }

    private JsonObject BuildCustomTimesNode()
    {
        var obj = new JsonObject();
        foreach (var (key, setting) in RaidTimes.CustomTimes)
        {
            obj[key] = setting.ToJsonNode();
        }

        return obj;
    }
}

public class GeneralSettings
{
    public bool Enabled { get; set; } = true;
    public bool Debug { get; set; }
}

public class RaidTimesSettings
{
    public bool OverrideAll { get; set; }
    public TimeSetting Override { get; set; } = new();
    public Dictionary<string, TimeSetting> CustomTimes { get; set; } = new();
    public bool OverrideScav { get; set; } = true;
}

public class TrainScheduleSettings
{
    public bool Auto { get; set; } = true;
    public StaticTrainSettings Static { get; set; } = new();
}

public class StaticTrainSettings
{
    public int ArriveEarliestMinutes { get; set; } = 20;
    public int ArriveLatestMinutes { get; set; } = 25;
    public int TrainWaitSeconds { get; set; } = 420;
}

public class TimeSetting
{
    public bool IsWeighted { get; set; }
    public int SimpleValue { get; set; }
    public List<WeightedEntry> Entries { get; set; } = [];

    /// <summary>
    /// Resolves this time setting to a single value, performing weighted random selection if needed.
    /// </summary>
    public int Resolve()
    {
        if (!IsWeighted)
        {
            return SimpleValue;
        }

        if (Entries.Count == 0)
        {
            return SimpleValue;
        }

        var items = Entries.Select(e => (Minutes: e.ResolveMinutes(), Weight: e.ResolveWeight())).ToList();

        var totalWeight = items.Sum(i => i.Weight);
        if (totalWeight <= 0)
        {
            return items[0].Minutes;
        }

        var roll = Random.Shared.NextDouble() * totalWeight;
        var cumulative = 0;
        foreach (var item in items)
        {
            cumulative += item.Weight;
            if (roll < cumulative)
            {
                return item.Minutes;
            }
        }

        return items[^1].Minutes;
    }

    public static TimeSetting FromJsonElement(JsonElement element)
    {
        if (element.ValueKind == JsonValueKind.Number)
        {
            return new TimeSetting
            {
                IsWeighted = false,
                SimpleValue = element.GetInt32()
            };
        }

        if (element.ValueKind == JsonValueKind.Array)
        {
            var entries = new List<WeightedEntry>();
            foreach (var item in element.EnumerateArray())
            {
                entries.Add(WeightedEntry.FromJsonElement(item));
            }

            return new TimeSetting
            {
                IsWeighted = true,
                Entries = entries
            };
        }

        return new TimeSetting();
    }

    public JsonNode ToJsonNode()
    {
        if (!IsWeighted)
        {
            return JsonValue.Create(SimpleValue);
        }

        var array = new JsonArray();
        foreach (var entry in Entries)
        {
            array.Add(entry.ToJsonNode());
        }

        return array;
    }
}

public class WeightedEntry
{
    public int Minutes { get; set; }
    public bool MinutesIsRange { get; set; }
    public int MinutesMin { get; set; }
    public int MinutesMax { get; set; }

    public int Weight { get; set; } = 1;
    public bool WeightIsRange { get; set; }
    public int WeightMin { get; set; }
    public int WeightMax { get; set; }

    public int ResolveMinutes()
    {
        if (!MinutesIsRange)
        {
            return Minutes;
        }

        var min = Math.Min(MinutesMin, MinutesMax);
        var max = Math.Max(MinutesMin, MinutesMax);
        return Random.Shared.Next(min, max + 1);
    }

    public int ResolveWeight()
    {
        if (!WeightIsRange)
        {
            return Weight;
        }

        var min = Math.Min(WeightMin, WeightMax);
        var max = Math.Max(WeightMin, WeightMax);
        return Random.Shared.Next(min, max + 1);
    }

    public static WeightedEntry FromJsonElement(JsonElement element)
    {
        var entry = new WeightedEntry();

        if (element.TryGetProperty("minutes", out var minutes))
        {
            if (minutes.ValueKind == JsonValueKind.Number)
            {
                entry.Minutes = minutes.GetInt32();
            }
            else if (minutes.ValueKind == JsonValueKind.Object)
            {
                entry.MinutesIsRange = true;
                if (minutes.TryGetProperty("min", out var minEl) && minEl.ValueKind == JsonValueKind.Number)
                    entry.MinutesMin = minEl.GetInt32();
                if (minutes.TryGetProperty("max", out var maxEl) && maxEl.ValueKind == JsonValueKind.Number)
                    entry.MinutesMax = maxEl.GetInt32();
            }
        }

        if (element.TryGetProperty("weight", out var weight))
        {
            if (weight.ValueKind == JsonValueKind.Number)
            {
                entry.Weight = weight.GetInt32();
            }
            else if (weight.ValueKind == JsonValueKind.Object)
            {
                entry.WeightIsRange = true;
                if (weight.TryGetProperty("min", out var minEl) && minEl.ValueKind == JsonValueKind.Number)
                    entry.WeightMin = minEl.GetInt32();
                if (weight.TryGetProperty("max", out var maxEl) && maxEl.ValueKind == JsonValueKind.Number)
                    entry.WeightMax = maxEl.GetInt32();
            }
        }

        return entry;
    }

    public JsonObject ToJsonNode()
    {
        var obj = new JsonObject();

        if (MinutesIsRange)
        {
            obj["minutes"] = new JsonObject { ["min"] = MinutesMin, ["max"] = MinutesMax };
        }
        else
        {
            obj["minutes"] = Minutes;
        }

        if (WeightIsRange)
        {
            obj["weight"] = new JsonObject { ["min"] = WeightMin, ["max"] = WeightMax };
        }
        else
        {
            obj["weight"] = Weight;
        }

        return obj;
    }
}
