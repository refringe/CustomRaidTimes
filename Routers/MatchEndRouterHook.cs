using SPTarkov.DI.Annotations;
using SPTarkov.Server.Core.Models.Eft.Match;
using SPTarkov.Server.Core.DI;
using SPTarkov.Server.Core.Utils;

namespace CustomRaidTimes.Routers;

[Injectable]
public class MatchEndRouterHook(JsonUtil jsonUtil, CustomRaidTimesPlugin plugin) : StaticRouter(jsonUtil,
[
    new RouteAction<EndLocalRaidRequestData>(
        "/client/match/local/end",
        async (url, info, sessionId, output) =>
        {
            plugin.ReloadAndProcess();
            return output!;
        }
    )
])
{
    //
}
