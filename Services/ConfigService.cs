using System.Reflection;
using CustomRaidTimes.Models;
using SPTarkov.DI.Annotations;
using SPTarkov.Server.Core.DI;
using SPTarkov.Server.Core.Helpers;
using SPTarkov.Server.Core.Models.Utils;

namespace CustomRaidTimes.Services;

[Injectable(InjectionType.Singleton, TypePriority = OnLoadOrder.PreSptModLoader + 1)]
public class ConfigService(
    ISptLogger<ConfigService> logger,
    ModHelper modHelper) : IOnLoad
{
    public ModConfig Config { get; private set; } = new();

    public Task OnLoad()
    {
        ReloadFromDisk();
        logger.Info($"[CustomRaidTimes] Config service loaded.");
        return Task.CompletedTask;
    }

    /// <summary>
    /// Reloads the configuration from disk into the in-memory model.
    /// Falls back to default config if the file is missing or corrupt.
    /// </summary>
    public void ReloadFromDisk()
    {
        try
        {
            var modPath = modHelper.GetAbsolutePathToModFolder(Assembly.GetExecutingAssembly());
            var json = File.ReadAllText(Path.Combine(modPath, "config.json"));
            Config = ModConfig.FromJson(json);
        }
        catch (Exception ex)
        {
            logger.Error($"[CustomRaidTimes] Failed to load config: {ex.Message}");
        }
    }

    /// <summary>
    /// Saves the current in-memory config to disk.
    /// </summary>
    public async Task SaveAsync()
    {
        try
        {
            var modPath = modHelper.GetAbsolutePathToModFolder(Assembly.GetExecutingAssembly());
            var json = Config.ToJson();
            await File.WriteAllTextAsync(Path.Combine(modPath, "config.json"), json);
            logger.Success($"[CustomRaidTimes] Configuration saved via web UI.");
        }
        catch (Exception ex)
        {
            logger.Error($"[CustomRaidTimes] Failed to save config: {ex.Message}");
            throw;
        }
    }
}
