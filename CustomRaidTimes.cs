using System.Reflection;
using System.Text.Json;
using CustomRaidTimes.Models;
using CustomRaidTimes.Patches;
using SPTarkov.DI.Annotations;
using SPTarkov.Server.Core.DI;
using SPTarkov.Server.Core.Models.Eft.Common;
using SPTarkov.Server.Core.Models.Enums;
using SPTarkov.Server.Core.Models.Spt.Mod;
using SPTarkov.Server.Core.Models.Utils;
using SPTarkov.Server.Core.Helpers;
using SPTarkov.Server.Core.Services;

namespace CustomRaidTimes;

public record ModMetadata : AbstractModMetadata
{
    public override string ModGuid { get; init; } = "com.refringe.customraidtimes";
    public override string Name { get; init; } = "CustomRaidTimes";
    public override string Author { get; init; } = "Refringe";
    public override List<string>? Contributors { get; init; }
    public override SemanticVersioning.Version Version { get; init; } = new("2.0.0");
    public override SemanticVersioning.Range SptVersion { get; init; } = new("~4.0.0");
    
    public override List<string>? Incompatibilities { get; init; }
    public override Dictionary<string, SemanticVersioning.Range>? ModDependencies { get; init; }
    public override string? Url { get; init; } = "https://github.com/refringe/CustomRaidTimes";
    public override bool? IsBundleMod { get; init; }
    public override string License { get; init; } = "MIT";
}

[Injectable(TypePriority = OnLoadOrder.PostDBModLoader + 1)]
public class CustomRaidTimesPlugin(ISptLogger<CustomRaidTimesPlugin> logger, DatabaseService databaseService, ModHelper modHelper) : IOnLoad
{
    private const string LogName = "[CustomRaidTimes]";

    // Train schedule constants
    private const int AnimateSec = 97;
    private const int MinWaitSec = 60;
    private const int BufferSec = 300;
    private const int RandomWaitMinMin = 5;
    private const int RandomWaitMaxMin = 14;
    private const int ArriveRandomRangeSec = 300;
    private const double BufferAdjustmentMaxPercent = 0.65;
    private const double BufferAdjustmentMinPercent = 0.2;

    private Configuration? _config;

    /// <summary>
    /// Location mappings: SPT database key to (config property accessor, human-readable name).
    /// </summary>
    private static readonly Dictionary<string, (Func<CustomTimesConfig, JsonElement> GetTime, string HumanName)> LocationMap = new()
    {
        ["Bigmap"] = (c => c.Customs, "Customs"),
        ["Factory4Day"] = (c => c.FactoryDay, "Factory (Day)"),
        ["Factory4Night"] = (c => c.FactoryNight, "Factory (Night)"),
        ["Interchange"] = (c => c.Interchange, "Interchange"),
        ["Laboratory"] = (c => c.Laboratory, "Laboratory"),
        ["Lighthouse"] = (c => c.Lighthouse, "Lighthouse"),
        ["RezervBase"] = (c => c.Reserve, "Reserve"),
        ["Sandbox"] = (c => c.GroundZero, "Ground Zero"),
        ["SandboxHigh"] = (c => c.GroundZeroHigh, "Ground Zero (High-level)"),
        ["Shoreline"] = (c => c.Shoreline, "Shoreline"),
        ["TarkovStreets"] = (c => c.Streets, "Streets of Tarkov"),
        ["Woods"] = (c => c.Woods, "Woods"),
        ["Labyrinth"] = (c => c.Labyrinth, "Labyrinth"),
    };

    public Task OnLoad()
    {
        _config = LoadConfig();
        if (_config == null)
        {
            logger.Error($"{LogName} Failed to load configuration file.");
            return Task.CompletedTask;
        }

        if (!_config.General.Enabled)
        {
            logger.Warning($"{LogName} Mod is disabled in the configuration file.");
            return Task.CompletedTask;
        }

        if (_config.RaidTimes.OverrideScav)
        {
            new ScavRaidTimePatch(databaseService).Enable();
            logger.Success($"{LogName} Scav raid time override enabled.");
        }

        ProcessAllLocations();

        return Task.CompletedTask;
    }

    /// <summary>
    /// Reloads the configuration from disk and reprocesses all locations. Called after each raid.
    /// </summary>
    public void ReloadAndProcess()
    {
        _config = LoadConfig();
        if (_config == null)
        {
            logger.Error($"{LogName} Failed to reload configuration file.");
            return;
        }

        if (!_config.General.Enabled)
        {
            return;
        }

        if (_config.General.Debug)
        {
            logger.Info($"{LogName} Reprocessing raid times after raid end.");
        }

        ProcessAllLocations();
    }

    private void ProcessAllLocations()
    {
        var config = _config!;
        var locations = databaseService.GetLocations().GetDictionary();

        foreach (var (locationKey, mapping) in LocationMap)
        {
            if (!locations.TryGetValue(locationKey, out var location) || location.Base == null)
            {
                continue;
            }

            var locationBase = location.Base;
            var originalTime = locationBase.EscapeTimeLimit;

            // Resolve the raid time from config
            var timeElement = config.RaidTimes.OverrideAll ? config.RaidTimes.Override : mapping.GetTime(config.RaidTimes.CustomTimes);

            var newTime = ResolveTimeValue(timeElement);
            locationBase.EscapeTimeLimit = newTime;

            if (config.General.Debug && locationBase.EscapeTimeLimit != originalTime)
            {
                logger.Info($"{LogName} {mapping.HumanName} raid time changed from {originalTime} to {newTime} minutes.");
            }

            // Adjust train schedule for exits with train passage requirement
            AdjustTrainSchedule(locationBase, config, mapping.HumanName);
        }

        logger.Success($"{LogName} Raid times have been successfully adjusted.");
    }

    /// <summary>
    /// Resolves a config time value that can be either a number or an array of weighted options.
    /// </summary>
    private static double ResolveTimeValue(JsonElement element)
    {
        if (element.ValueKind == JsonValueKind.Number)
        {
            return element.GetDouble();
        }

        if (element.ValueKind != JsonValueKind.Array)
        {
            return 0;
        }

        var items = new List<(double Minutes, double Weight)>();
        foreach (var entry in element.EnumerateArray())
        {
            var minutes = entry.TryGetProperty("minutes", out var m) ? ResolveNumberOrRange(m) : 0;
            var weight = entry.TryGetProperty("weight", out var w) ? ResolveNumberOrRange(w) : 1;
            items.Add((minutes, weight));
        }

        if (items.Count == 0)
        {
            return 0;
        }

        // Weighted random selection
        var totalWeight = items.Sum(i => i.Weight);
        if (totalWeight <= 0)
        {
            return items[0].Minutes;
        }

        var roll = Random.Shared.NextDouble() * totalWeight;
        var cumulative = 0.0;
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

    /// <summary>
    /// Resolves a value that can be a number or a { min, max } range object.
    /// </summary>
    private static double ResolveNumberOrRange(JsonElement element)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.Number:
                return element.GetDouble();

            case JsonValueKind.Object when element.TryGetProperty("min", out var minEl) && element.TryGetProperty("max", out var maxEl):
                var min = (int)minEl.GetDouble();
                var max = (int)maxEl.GetDouble();
                return Random.Shared.Next(min, max + 1);

            default:
                return 0;
        }
    }

    private void AdjustTrainSchedule(LocationBase locationBase, Configuration config, string humanName)
    {
        if (locationBase.Exits == null)
        {
            return;
        }

        foreach (var exit in locationBase.Exits)
        {
            if (exit.PassageRequirement != RequirementState.Train)
            {
                continue;
            }

            AdjustTrainExit(exit, locationBase, config, humanName);
        }
    }

    private void AdjustTrainExit(Exit exit, LocationBase locationBase, Configuration config, string humanName)
    {
        var raidTimeSec = (locationBase.EscapeTimeLimit ?? 0) * 60;
        var trainExtractWaitSec = exit.ExfiltrationTime ?? 0;

        // Calculate train schedule
        var trainWaitSec = (double)GetRandomTrainWaitTime();
        var (trainArriveEarliest, trainArriveLatest) = GetInitialTrainArrivalTimes(raidTimeSec, trainExtractWaitSec, trainWaitSec);

        if (!config.TrainSchedule.Auto)
        {
            // Static scheduling: use config values, validate the latest arrival
            trainArriveEarliest = config.TrainSchedule.Static.ArriveEarliestMinutes * 60;
            trainArriveLatest = config.TrainSchedule.Static.ArriveLatestMinutes * 60;
            trainWaitSec = config.TrainSchedule.Static.TrainWaitSeconds;

            var calculatedLatestArrival = GetLatestTrainArrivalTime(raidTimeSec, trainExtractWaitSec, trainWaitSec);
            if (trainArriveLatest > calculatedLatestArrival)
            {
                trainArriveLatest = calculatedLatestArrival;
            }
        }

        // Ensure earliest arrival is not negative
        if (trainArriveEarliest < 0)
        {
            trainArriveEarliest = 0;
        }

        // If the latest arrival is invalid, reduce the wait time until it fits
        if (trainArriveLatest <= 0)
        {
            (trainArriveEarliest, trainArriveLatest, trainWaitSec) = AdjustForLateTrain(trainWaitSec, raidTimeSec, trainExtractWaitSec);
            if (trainArriveLatest < 0)
            {
                logger.Warning($"{LogName} {humanName} Train Schedule - Train cannot depart before the end of the raid. Raid time is too short.");
            }
        }

        // If auto and enough buffer time, shift the earliest arrival earlier (65%-20% of available time)
        if (config.TrainSchedule.Auto && trainArriveEarliest > BufferSec)
        {
            trainArriveEarliest -= GetAdjustmentTime(trainArriveEarliest);
        }

        // Apply the new train times
        exit.MinTime = trainArriveEarliest;
        exit.MaxTime = trainArriveLatest;
        exit.Count = (int)trainWaitSec;

        if (!config.General.Debug)
        {
            return;
        }

        var earliestMin = (trainArriveEarliest / 60).ToString("F2");
        var latestMin = (trainArriveLatest / 60).ToString("F2");
        var waitMin = (trainWaitSec / 60).ToString("F2");
        logger.Info($"{LogName} {humanName} Train Schedule - Earliest: {earliestMin} min, Latest: {latestMin} min, Wait: {waitMin} min.");
    }

    private static (double Earliest, double Latest) GetInitialTrainArrivalTimes(double raidTimeSec, double trainExtractWaitSec, double trainWaitSec)
    {
        var latestArrival = GetLatestTrainArrivalTime(raidTimeSec, trainExtractWaitSec, trainWaitSec);
        var earliestArrival = latestArrival - ArriveRandomRangeSec;

        if (latestArrival > 0 && earliestArrival < 0)
        {
            earliestArrival = 0;
        }

        return (earliestArrival, latestArrival);
    }

    private static (double Earliest, double Latest, double WaitSec) AdjustForLateTrain(double trainWaitSec, double raidTimeSec, double trainExtractWaitSec)
    {
        var adjustedWaitSec = trainWaitSec;
        double latestArrival;

        do
        {
            adjustedWaitSec--;
            latestArrival = GetLatestTrainArrivalTime(raidTimeSec, trainExtractWaitSec, adjustedWaitSec);
        } while (latestArrival < 0 && adjustedWaitSec > MinWaitSec);

        return (0, latestArrival, adjustedWaitSec);
    }

    /// <summary>
    /// Random train wait time: between 5 and 13 minutes (in seconds).
    /// </summary>
    private static int GetRandomTrainWaitTime()
    {
        return Random.Shared.Next(RandomWaitMinMin, RandomWaitMaxMin) * 60;
    }

    private static double GetLatestTrainArrivalTime(double raidTimeSec, double trainExtractWaitSec, double trainWaitSec)
    {
        return raidTimeSec - AnimateSec - trainExtractWaitSec - trainWaitSec;
    }

    /// <summary>
    /// Calculates a random time shift (20%-65% of available time) for the earliest arrival.
    /// </summary>
    private static double GetAdjustmentTime(double trainArriveEarliest)
    {
        var adjustmentPercentage = Random.Shared.NextDouble()
            * (BufferAdjustmentMaxPercent - BufferAdjustmentMinPercent)
            + BufferAdjustmentMinPercent;
        return Math.Floor(trainArriveEarliest * adjustmentPercentage);
    }

    private Configuration? LoadConfig()
    {
        try
        {
            var modPath = modHelper.GetAbsolutePathToModFolder(Assembly.GetExecutingAssembly());
            return modHelper.GetJsonDataFromFile<Configuration>(modPath, "config.json");
        }
        catch (Exception ex)
        {
            logger.Error($"{LogName} {ex.Message}");
            return null;
        }
    }
}
