import { join } from 'path';
import { DependencyContainer } from 'tsyringe';
import { adjustForIncompatibleMods, loadConfig, validateConfig } from '.';
import { Configuration } from '../types';
import { getLogger } from '../utils/logger';

export async function getConfig(container: DependencyContainer): Promise<Configuration | null> {
    const logger = getLogger(container);

    const configPath = join(__dirname, '../../config/config.json5');
    let config: Configuration | null = null;

    // Load the configuration file.
    try {
        config = await loadConfig(configPath);
    } catch (error: any) {
        logger.log(`CustomRaidTimes: An error occurred while loading the configuration file. ${error.message}`, 'red');
        return null;
    }

    // Validate the configuration file.
    try {
        validateConfig(config);
    } catch (error: any) {
        logger.log(`CustomRaidTimes: Configuration file validation failed. ${error.message}`, 'red');
        return null;
    }

    // Return null if the mod is disabled in the configuration file.
    if (!config.general.enabled) {
        logger.log('CustomRaidTimes is disabled in the config file.', 'red');
        return null;
    }

    // Adjust the configuration file for incompatible mods.
    return adjustForIncompatibleMods(container, config) as Configuration;
}
