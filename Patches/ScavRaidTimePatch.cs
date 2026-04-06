using System.Reflection;
using SPTarkov.Reflection.Patching;
using SPTarkov.Server.Core.Models.Common;
using SPTarkov.Server.Core.Models.Eft.Game;
using SPTarkov.Server.Core.Models.Spt.Location;
using SPTarkov.Server.Core.Services;

namespace CustomRaidTimes.Patches;

/// <summary>
/// Patch on RaidTimeAdjustmentService.GetRaidAdjustments.
///
/// Prevents the server from reducing scav raid times when overrideScav is enabled. The patched method returns the base
/// escape time limit (already set by our mod) with no simulated raid start offset.
/// </summary>
public class ScavRaidTimePatch(DatabaseService databaseService) : AbstractPatch
{
    private static DatabaseService? _databaseService;

    public new void Enable()
    {
        _databaseService = databaseService;
        base.Enable();
    }

    protected override MethodBase GetTargetMethod()
    {
        return typeof(RaidTimeAdjustmentService).GetMethod(nameof(RaidTimeAdjustmentService.GetRaidAdjustments))!;
    }

    [PatchPostfix]
    public static void Postfix(ref RaidChanges __result, MongoId sessionId, GetRaidTimeRequest request)
    {
        if (_databaseService == null)
        {
            return;
        }

        var location = _databaseService.GetLocation(request.Location?.ToLower() ?? "");
        if (location?.Base == null)
        {
            return;
        }

        // Override the result to use our custom raid time.
        __result.RaidTimeMinutes = location.Base.EscapeTimeLimit ?? __result.RaidTimeMinutes;
        __result.SimulatedRaidStartSeconds = 0;
        __result.DynamicLootPercent = 100;
        __result.StaticLootPercent = 100;
        __result.NewSurviveTimeSeconds = __result.OriginalSurvivalTimeSeconds;
        __result.ExitChanges = [];
    }
}
