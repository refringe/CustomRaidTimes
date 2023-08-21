import { promises as fs } from 'fs';
import * as json5 from 'json5';
import type { Configuration } from '../types';

/**
 * Loads the configuration file from the specified path and returns it as a Configuration object.
 */
export async function loadConfig(configFilePath: string): Promise<Configuration> {
    // Load the configuration file
    const configFileContent = await fs.readFile(configFilePath, 'utf-8');
    const config = json5.parse(configFileContent);

    return config as Configuration;
}
