import { PreAkiModLoader } from "@spt-aki/loaders/PreAkiModLoader";
import { DependencyContainer } from "tsyringe";
import type { Configuration, IncompatibleModEntry } from "../types";
import { set } from "../utils/array";
import { getLogger } from "../utils/logger";

// Definition of incompatible mods and corresponding adjustments.
const incompatibleMods: IncompatibleModEntry[] = [
    {
        mods: ["SWAG", "MOAR", "BetterSpawnsPlus", "POOP"],
        config: "botSpawn.adjustWaves",
        value: false,
    },
];

/**
 * Adjusts the configuration for any incompatible mods that are installed.
 */
export function adjustForIncompatibleMods(container: DependencyContainer, config: Configuration): Configuration {
    const logger = getLogger(container);

    const installedMods = getInstalledMods(container);
    if (installedMods.size === 0) {
        // Because *this* mod is loaded, this should never be empty, but just in case...
        return config;
    }

    if (config.general.debug) {
        logger.log(
            `CustomRaidTimes: Detected the following installed mods: ${Array.from(installedMods).join(", ")}`,
            "gray"
        );
    }

    // Get a set of incompatible mods that are installed.
    const installedIncompatibleMods = getIncompatibleMods(installedMods);
    if (installedIncompatibleMods.size === 0) {
        return config;
    }

    // Adjust the configuration for any installed incompatible mods and log a warning.
    incompatibleMods.forEach(incompatibility => {
        const matchedIncompatibles = incompatibility.mods.filter(incompatibleMod =>
            Array.from(installedIncompatibleMods).some(installedMod =>
                installedMod.toLowerCase().includes(incompatibleMod.toLowerCase())
            )
        );

        if (matchedIncompatibles.length > 0) {
            logger.log(
                `CustomRaidTimes: Incompatible mods are installed: ${matchedIncompatibles.join(
                    ", "
                )}. Forcing configuration option ${incompatibility.config} to ${incompatibility.value}.`,
                "yellow"
            );

            set(config, incompatibility.config, incompatibility.value);
        }
    });

    return config;
}

/**
 * Check if any incompatible mods that are currently installed. Return a list of the incompatible mods.
 */
function getIncompatibleMods(loadedMods: Set<string>): Set<string> {
    const incompatibleInstalledMods = new Set<string>();

    // Convert loadedMods to lowercase for easier comparison
    const lowercaseLoadedMods = new Set<string>();
    loadedMods.forEach(mod => lowercaseLoadedMods.add(mod.toLowerCase()));

    incompatibleMods.forEach(incompatibility => {
        incompatibility.mods.forEach(incompatibleMod => {
            const lowercaseIncompatibleMod = incompatibleMod.toLowerCase();

            lowercaseLoadedMods.forEach(loadedMod => {
                if (loadedMod === lowercaseIncompatibleMod || loadedMod.includes(lowercaseIncompatibleMod)) {
                    // Add the original loaded mod (not the lowercase version) to the incompatibleInstalledMods set.
                    incompatibleInstalledMods.add(Array.from(loadedMods).find(mod => mod.toLowerCase() === loadedMod));
                }
            });
        });
    });

    return incompatibleInstalledMods;
}

/**
 * Get a list of all installed mods. Should also include this mod.
 */
function getInstalledMods(container: DependencyContainer): Set<string> {
    const preAkiModLoader = container.resolve<PreAkiModLoader>("PreAkiModLoader");
    return new Set(preAkiModLoader.getImportedModsNames());
}
