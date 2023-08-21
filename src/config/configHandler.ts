import { join } from 'path';
import { loadConfig, validateConfig } from '.';
import type { Configuration } from '../types';

/**
 * Loads and validates the configuration file.
 */
export async function loadAndValidateConfig(): Promise<Configuration> {
    let config: Configuration;
    const configPath = join(__dirname, '../../config/config.json5');

    // Load the configuration file and throw an error if it fails.
    try {
        config = await loadConfig(configPath);
    } catch (error: any) {
        throw new Error(`Error loading configuration. ${error.message}`);
    }

    // Validate the configuration and throw an error if invalid.
    const validationError = validateConfig(config);
    if (validationError) {
        throw new Error(validationError);
    }

    return config;
}
