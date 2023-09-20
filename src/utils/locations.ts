import type { ILocations } from "@spt-aki/models/spt/server/ILocations";
import type { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { DependencyContainer } from "tsyringe";

/**
 * Fetches the locations from the database.
 *
 * @param container The dependency injection container.
 * @returns The locations from the database.
 */
export function getLocations(container: DependencyContainer): ILocations {
    return container.resolve<DatabaseServer>("DatabaseServer").getTables().locations;
}

/**
 * Returns the spawn zones for a given location.
 *
 * @param gameLocationName The name of the location as it's stored in the game.
 * @param sniper Whether or not to include sniper zones.
 * @returns The spawn zones for the given game location.
 */
export function getSpawnZones(gameLocationName: string, sniper = true): string {
    const baseZones = [];
    const sniperZones = [];

    switch (gameLocationName.toLowerCase()) {
        case "bigmap":
            baseZones.push(
                "ZoneBrige",
                "ZoneCrossRoad",
                "ZoneDormitory",
                "ZoneGasStation",
                "ZoneFactoryCenter",
                "ZoneFactorySide",
                "ZoneOldAZS",
                "ZoneBlockPost",
                "ZoneBlockPost",
                "ZoneTankSquare",
                "ZoneWade",
                "ZoneCustoms",
                "ZoneScavBase"
            );
            sniperZones.push(
                "ZoneSnipeBrige",
                "ZoneSnipeTower",
                "ZoneSnipeFactory",
                "ZoneBlockPostSniper",
                "ZoneBlockPostSniper3"
            );
            break;
        case "factory4_day":
        case "factory4_night":
            baseZones.push("BotZone");
            break;
        case "interchange":
            baseZones.push(
                "ZoneCenter",
                "ZoneCenterBot",
                "ZoneOLI",
                "ZoneIDEA",
                "ZoneRoad",
                "ZoneIDEAPark",
                "ZoneGoshan",
                "ZonePowerStation",
                "ZoneTrucks",
                "ZoneOLIPark"
            );
            break;
        case "laboratory":
            baseZones.push("BotZoneFloor1", "BotZoneFloor2", "BotZoneBasement");
            break;
        case "lighthouse":
            baseZones.push(
                "Zone_TreatmentContainers",
                "Zone_LongRoad",
                "Zone_Blockpost",
                "Zone_TreatmentBeach",
                "Zone_Hellicopter",
                "Zone_RoofContainers",
                "Zone_Village",
                "Zone_OldHouse",
                "Zone_RoofRocks",
                "Zone_DestroyedHouse",
                "Zone_Chalet",
                "Zone_RoofBeach",
                "Zone_Containers",
                "Zone_TreatmentRocks",
                "Zone_Rocks",
                "Zone_Island"
            );
            sniperZones.push("Zone_SniperPeak");
            break;
        case "rezervbase":
            baseZones.push(
                "ZoneRailStrorage",
                "ZonePTOR1",
                "ZonePTOR2",
                "ZoneBarrack",
                "ZoneBunkerStorage",
                "ZoneSubStorage",
                "ZoneSubCommand"
            );
            break;
        case "shoreline":
            baseZones.push(
                "ZoneSanatorium1",
                "ZoneSanatorium2",
                "ZonePassFar",
                "ZonePassClose",
                "ZoneTunnel",
                "ZoneStartVillage",
                "ZoneBunker",
                "ZoneGreenHouses",
                "ZoneIsland",
                "ZoneGasStation",
                "ZoneMeteoStation",
                "ZonePowerStation",
                "ZoneBusStation",
                "ZoneRailWays",
                "ZonePort",
                "ZoneForestTruck",
                "ZoneForestSpawn",
                "ZoneForestGasStation"
            );
            sniperZones.push("ZonePowerStationSniper", "ZoneBunkeSniper");
            break;
        case "tarkovstreets":
            baseZones.push(
                "ZoneCarShowroom",
                "ZoneCinema",
                "ZoneColumn",
                "ZoneConcordia_1",
                "ZoneConcordia_2",
                "ZoneConcordiaParking",
                "ZoneConstruction",
                "ZoneFactory",
                "ZoneHotel_1",
                "ZoneHotel_2",
                "ZoneSW01"
            );
            sniperZones.push("ZoneSnipeBuilding", "ZoneSnipeCarShowroom", "ZoneSnipeCinema", "ZoneSnipeSW01");
            break;
        case "woods":
            baseZones.push(
                "ZoneRedHouse",
                "ZoneWoodCutter",
                "ZoneHouse",
                "ZoneBigRocks",
                "ZoneRoad",
                "ZoneMiniHouse",
                "ZoneScavBase2",
                "ZoneBrokenVill",
                "ZoneClearVill",
                "ZoneHighRocks"
            );
            break;
        default:
            return "";
    }

    return baseZones.concat(sniper ? sniperZones : []).join(",");
}

/**
 * Fetches the name of the location as it's stored in the configuration file.
 *
 * @param gameLocationName The name of the location as it's stored in the game.
 * @returns The name of the location as it's stored in the configuration file.
 */
export function getConfigLocationName(gameLocationName: string): string {
    const location = gameLocationName.toLowerCase();

    switch (location) {
        case "bigmap":
            return "customs";
        case "factory4_day":
            return "factoryDay";
        case "factory4_night":
            return "factoryNight";
        case "rezervbase":
        case "reservebase":
            return "reserve";
        case "tarkovstreets":
            return "streets";
        default:
            return location;
    }
}

/**
 * Returns the human-readable name of a game location based on its internal name.
 *
 * @param gameLocationName The internal name of the location to convert.
 * @returns The human-readable name of the location, or the input name if it is not recognized.
 */
export function getHumanLocationName(gameLocationName: string): string {
    const location = gameLocationName.toLowerCase();

    switch (location) {
        case "bigmap":
            return "Customs";
        case "factory4_day":
            return "Factory (Day)";
        case "factory4_night":
            return "Factory (Night)";
        case "interchange":
            return "Interchange";
        case "laboratory":
            return "Laboratory";
        case "lighthouse":
            return "Lighthouse";
        case "rezervbase":
        case "reservebase":
            return "Reserve";
        case "shoreline":
            return "Shoreline";
        case "tarkovstreets":
            return "Streets of Tarkov";
        case "woods":
            return "Woods";
        default:
            return location;
    }
}
