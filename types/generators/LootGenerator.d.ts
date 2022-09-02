import { ItemHelper } from "../helpers/ItemHelper";
import { Preset } from "../models/eft/common/IGlobals";
import { ITemplateItem } from "../models/eft/common/tables/ITemplateItem";
import { LootItem } from "../models/spt/services/LootItem";
import { LootRequest } from "../models/spt/services/LootRequest";
import { ILogger } from "../models/spt/utils/ILogger";
import { DatabaseServer } from "../servers/DatabaseServer";
import { ItemFilterService } from "../services/ItemFilterService";
import { RandomUtil } from "../utils/RandomUtil";
export declare class LootGenerator {
    protected logger: ILogger;
    protected databaseServer: DatabaseServer;
    protected randomUtil: RandomUtil;
    protected itemHelper: ItemHelper;
    protected itemFilterService: ItemFilterService;
    constructor(logger: ILogger, databaseServer: DatabaseServer, randomUtil: RandomUtil, itemHelper: ItemHelper, itemFilterService: ItemFilterService);
    /**
     * Generate a list of items based on options passed in
     * @param options parameters to adjust what loot is generated
     * @returns An array of loot items
     */
    createRandomloot(options: LootRequest): LootItem[];
    /**
     * Construct item limit record to hold max and current item count
     * @param limits limits as defined in config
     * @returns record, key: item tplId, value: current/max item count allowed
     */
    protected initItemLimitCounter(limits: Record<string, number>): Record<string, {
        current: number;
        max: number;
    }>;
    /**
     * Find a random item in items.json and add to result array
     * @param items items to choose from
     * @param itemTypeCounts item limit counts
     * @param result array to add found item to
     * @returns true if item was valid and added to pool
     */
    protected findAndAddRandomItemToLoot(items: [string, ITemplateItem][], itemTypeCounts: Record<string, {
        current: number;
        max: number;
    }>, result: LootItem[]): boolean;
    /**
     *
     * Find a random item in items.json and add to result array
     * @param globalDefaultPresets presets to choose from
     * @param itemTypeCounts item limit counts
     * @param result array to add found preset to
     * @returns true if preset was valid and added to pool
     */
    protected findAndAddRandomPresetToLoot(globalDefaultPresets: [string, Preset][], itemTypeCounts: Record<string, {
        current: number;
        max: number;
    }>, result: LootItem[]): boolean;
}
