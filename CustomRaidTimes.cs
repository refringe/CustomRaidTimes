using CustomRaidTimes.Models;
using CustomRaidTimes.Patches;
using CustomRaidTimes.Services;
using SPTarkov.DI.Annotations;
using SPTarkov.Server.Core.DI;
using SPTarkov.Server.Core.Models.Eft.Common;
using SPTarkov.Server.Core.Models.Enums;
using SPTarkov.Server.Core.Models.Spt.Mod;
using SPTarkov.Server.Core.Models.Utils;
using SPTarkov.Server.Core.Helpers;
using SPTarkov.Server.Core.Services;
using SPTarkov.Server.Web;

namespace CustomRaidTimes;

public record ModMetadata : AbstractModMetadata, IModWebMetadata
{
    public override string ModGuid { get; init; } = "com.refringe.customraidtimes";
    public override string Name { get; init; } = "CustomRaidTimes";
    public override string Author { get; init; } = "Refringe";
    public override List<string>? Contributors { get; init; }
    public override SemanticVersioning.Version Version { get; init; } = new("2.0.2");
    public override SemanticVersioning.Range SptVersion { get; init; } = new("~4.0.0");

    public override List<string>? Incompatibilities { get; init; }
    public override Dictionary<string, SemanticVersioning.Range>? ModDependencies { get; init; }
    public override string? Url { get; init; } = "https://github.com/refringe/CustomRaidTimes";
    public override bool? IsBundleMod { get; init; }
    public override string License { get; init; } = "MIT";
}

[Injectable(TypePriority = OnLoadOrder.PostDBModLoader + 1)]
public class CustomRaidTimesPlugin(
    ISptLogger<CustomRaidTimesPlugin> logger,
    DatabaseService databaseService,
    ConfigService configService,
    HttpServerHelper httpServerHelper) : IOnLoad
{
    // Train schedule constants
    private const int AnimateSec = 97;
    private const int MinWaitSec = 60;
    private const int BufferSec = 300;
    private const int RandomWaitMinMinutes = 5;
    private const int RandomWaitMaxMinutes = 14;
    private const int ArriveRandomRangeSec = 300;
    private const double BufferAdjustmentMaxPercent = 0.65;
    private const double BufferAdjustmentMinPercent = 0.2;

    public Task OnLoad()
    {
        var config = configService.Config;

        if (!config.General.Enabled)
        {
            logger.Warning($"[CustomRaidTimes] Mod is disabled in the configuration file.");
            return Task.CompletedTask;
        }

        if (config.RaidTimes.OverrideScav)
        {
            new ScavRaidTimePatch(databaseService).Enable();
            if (config.General.Debug)
            {
                logger.Info($"[CustomRaidTimes] Scav raid time override enabled.");
            }
        }

        ProcessAllLocations();

        var backendUrl = httpServerHelper.GetBackendUrl().Replace("://0.0.0.0", "://127.0.0.1");
        logger.Info($"[CustomRaidTimes] Web config: {backendUrl}/custom-raid-times");

        return Task.CompletedTask;
    }

    /// <summary>
    /// Reloads configuration from disk and reprocesses all locations. Called by the match-end hook.
    /// </summary>
    public void ReloadAndProcess()
    {
        configService.ReloadFromDisk();
        ApplyConfig();
    }

    /// <summary>
    /// Reprocesses all locations using the current in-memory config. Called after web UI saves.
    /// </summary>
    public void ApplyConfig()
    {
        var config = configService.Config;
        if (!config.General.Enabled)
        {
            return;
        }

        if (config.General.Debug)
        {
            logger.Info($"[CustomRaidTimes] Reprocessing raid times.");
        }

        ProcessAllLocations();
    }

    private void ProcessAllLocations()
    {
        var config = configService.Config;
        var locations = databaseService.GetLocations().GetDictionary();

        foreach (var (locationKey, (configKey, label)) in ModConfig.LocationMap)
        {
            if (!locations.TryGetValue(locationKey, out var location))
            {
                continue;
            }

            var locationBase = location.Base;
            var originalTime = locationBase.EscapeTimeLimit;

            // Resolve the raid time from config
            var timeSetting = config.RaidTimes.OverrideAll
                ? config.RaidTimes.Override
                : config.RaidTimes.CustomTimes.GetValueOrDefault(configKey, new TimeSetting());

            var newTime = timeSetting.Resolve();
            locationBase.EscapeTimeLimit = newTime;

            if (config.General.Debug && newTime != (int?)originalTime)
            {
                logger.Info($"[CustomRaidTimes] {label} raid time changed from {originalTime} to {newTime} minutes.");
            }

            // Adjust train schedule for exits with train passage requirement
            AdjustTrainSchedule(locationBase, config, label);
        }

        logger.Success($"[CustomRaidTimes] Raid times have been successfully adjusted.");
    }

    #region Train Schedule

    private void AdjustTrainSchedule(LocationBase locationBase, ModConfig config, string humanName)
    {
        foreach (var exit in locationBase.Exits)
        {
            if (exit.PassageRequirement != RequirementState.Train)
            {
                continue;
            }

            AdjustTrainExit(exit, locationBase, config, humanName);
        }
    }

    private void AdjustTrainExit(Exit exit, LocationBase locationBase, ModConfig config, string humanName)
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
                logger.Warning($"[CustomRaidTimes] {humanName} Train Schedule - Train cannot depart before the end of the raid. Raid time is too short.");
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
        logger.Info($"[CustomRaidTimes] {humanName} Train Schedule - Earliest: {earliestMin} min, Latest: {latestMin} min, Wait: {waitMin} min.");
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
    /// Generate a random train wait time (in seconds).
    /// </summary>
    private static int GetRandomTrainWaitTime()
    {
        return Random.Shared.Next(RandomWaitMinMinutes, RandomWaitMaxMinutes) * 60;
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

    #endregion
}
