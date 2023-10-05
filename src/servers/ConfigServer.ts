import Ajv, { ValidateFunction } from "ajv";
import * as fs from "fs";
import { JSONSchema7 } from "json-schema";
import * as json5 from "json5";
import { join } from "path";
import { ConfigSchema } from "../schemas/ConfigSchema";
import type { Configuration, IncompatibleModEntry } from "../types";
import { CustomRaidTimes } from "../CustomRaidTimes";
import type { PreAkiModLoader } from "@spt-aki/loaders/PreAkiModLoader";

/**
 * ConfigServer Class
 *
 * The ConfigServer class is responsible for managing the application's configuration settings.
 * It provides functionality to load and validate a configuration file, which is specified in JSON5 format.
 * The class checks the validity of the configuration and ensures that they match the schema.
 */
export class ConfigServer {
    private relativeConfigPath: string;
    private configPath: string;
    private config: Configuration | unknown | null = null;
    private isLoaded: boolean = false;
    private isValid: boolean = false;
    private conflicts: IncompatibleModEntry[];

    // JSON schema validator & config schema
    private ajv: Ajv;
    private validate: ValidateFunction;
    private configSchema: JSONSchema7;

    /**
     * Constructs a new ConfigServer instance.
     * Automatically loads and validates the configuration file specified by the relative path.
     *
     * @param {string} relativeConfigPath - The relative path to the configuration file.
     */
    constructor(relativeConfigPath: string = "../../config/config.json5") {
        this.relativeConfigPath = relativeConfigPath;
        this.configPath = this.buildConfigPath();
        this.conflicts = CustomRaidTimes.conflicts;

        this.ajv = new Ajv();
        this.configSchema = ConfigSchema.schema;
        this.validate = this.ajv.compile(this.configSchema);
    }

    /**
     * Constructs the absolute path to the configuration file based on its relative path.
     *
     * @returns {string} - The absolute path to the configuration file.
     */
    private buildConfigPath(): string {
        return join(__dirname, this.relativeConfigPath);
    }

    /**
     * Loads the configuration from a file. Sets the `isLoaded` flag to true if successful, false otherwise. Throws a
     * ConfigError if the file cannot be loaded.
     *
     * @returns {this} - Returns the ConfigServer instance.
     */
    public loadConfig(): this {
        try {
            const configFileContent = fs.readFileSync(this.configPath, "utf-8");
            this.config = json5.parse(configFileContent) as unknown; // Still needs validation.
            this.isLoaded = true;
        } catch (error) {
            this.config = null;
            this.isLoaded = false;
            this.isValid = false;
            throw new Error("CONFIG_LOAD_ERROR - Could not load configuration");
        }
        return this;
    }

    /**
     * Validates the loaded configuration. Sets the `isValid` flag to true if the validation is successful, false
     * otherwise. Throws a ConfigError if the configuration is not loaded or is invalid.
     *
     * @returns {this} - Returns the ConfigServer instance.
     */
    public validateConfig(): this {
        if (!this.isLoaded) {
            throw new Error("CONFIG_NOT_LOADED - Configuration not loaded");
        }

        if (this.config === null) {
            throw new Error("CONFIG_IS_NULL - Configuration is null");
        }

        const valid = this.validate(this.config);
        if (!valid) {
            this.config = null;
            this.isValid = false;
            throw new Error(
                "CONFIG_VALIDATION_ERROR - Configuration validation failed - " +
                    this.ajv.errorsText(this.validate.errors)
            );
        }

        this.config = this.config as Configuration; // Safe cast after validation.
        this.isValid = true;

        return this;
    }

    /**
     * Adjusts the configuration for any incompatible mods that are installed.
     *
     * @returns {this} - Returns the ConfigServer instance.
     */
    public adjustConflicts(): this {
        if (!this.isValid) {
            throw new Error("CONFIG_INVALID - Configuration not valid or not loaded");
        }
        if (this.conflicts.length === 0) {
            throw new Error("INVALID_CONFLICTS - Conflicts array is invalid or empty");
        }

        const config = this.config as Configuration; // Safe cast after validation.

        const installedMods = this.getInstalledMods();
        if (installedMods.size === 0) {
            return this;
        }

        if (config.general.debug) {
            CustomRaidTimes.logger.log(
                `CustomRaidTimes: Detected the following installed mods: ${Array.from(installedMods).join(", ")}`,
                "gray"
            );
        }

        // Get a set of incompatible mods that are installed.
        const installedIncompatibleMods = this.getIncompatibleMods(installedMods);
        if (installedIncompatibleMods.size === 0) {
            return this;
        }

        // Adjust the configuration for any installed incompatible mods and log a warning.
        this.conflicts.forEach(incompatibility => {
            const matchedIncompatibles = incompatibility.mods.filter(incompatibleMod =>
                Array.from(installedIncompatibleMods).some((installedMod: string) =>
                    installedMod.toLowerCase().includes(incompatibleMod.toLowerCase())
                )
            );

            if (matchedIncompatibles.length > 0) {
                CustomRaidTimes.logger.log(
                    `CustomRaidTimes: Incompatible mods are installed: ${matchedIncompatibles.join(
                        ", "
                    )}. Forcing configuration option ${incompatibility.config} to ${incompatibility.value}.`,
                    "yellow"
                );

                this.setConfig(config, incompatibility.config, incompatibility.value);
            }
        });

        return this;
    }

    /**
     * Check if any incompatible mods that are currently installed. Return a list of the incompatible mods.
     *
     * @param {Set<string>} loadedMods - A set of loaded mods.
     * @returns {Set<string>} - A set of incompatible mods that are installed.
     */
    private getIncompatibleMods(loadedMods: Set<string>): Set<string> {
        const incompatibleInstalledMods = new Set<string>();

        // Convert loadedMods to lowercase for easier comparison
        const lowercaseLoadedMods = new Set<string>();
        loadedMods.forEach(mod => lowercaseLoadedMods.add(mod.toLowerCase()));

        this.conflicts.forEach(incompatibility => {
            incompatibility.mods.forEach(incompatibleMod => {
                const lowercaseIncompatibleMod = incompatibleMod.toLowerCase();

                lowercaseLoadedMods.forEach(loadedMod => {
                    if (loadedMod === lowercaseIncompatibleMod || loadedMod.includes(lowercaseIncompatibleMod)) {
                        // Add the original loaded mod (not the lowercase version) to the incompatibleInstalledMods set.
                        incompatibleInstalledMods.add(
                            Array.from(loadedMods).find(mod => mod.toLowerCase() === loadedMod)
                        );
                    }
                });
            });
        });

        return incompatibleInstalledMods;
    }

    /**
     * Get a list of all installed mods. Should also include this mod.
     *
     * @returns {Set<string>} - A set of installed mods.
     */
    private getInstalledMods(): Set<string> {
        const preAkiModLoader = CustomRaidTimes.container.resolve<PreAkiModLoader>("PreAkiModLoader");
        return new Set(preAkiModLoader.getImportedModsNames());
    }

    /**
     * Sets a configuration value at the specified path.
     *
     * @param {any} obj - The object to set the value on.
     * @param {string} path - The path to the value to set.
     * @param {any} value - The value to set.
     */
    private setConfig(obj: any, path: string, value: any): void {
        const parts = path.split(".");
        let current = obj;

        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (!(part in current)) {
                current[part] = {};
            }
            current = current[part];
        }

        current[parts[parts.length - 1]] = value;
    }

    /**
     * Type guard for the Configuration type.
     *
     * @param {unknown} config - The configuration to check.
     * @returns {boolean} - True if the configuration is valid, false otherwise.
     */
    private isConfiguration(config: unknown): config is Configuration {
        return this.validate(config) as boolean;
    }

    /**
     * Retrieves the loaded and validated configuration.
     *
     * @returns {Configuration | null} - The loaded and validated configuration, or null if the configuration invalid.
     */
    public getConfig(): Configuration | null {
        if (!this.isValid) {
            throw new Error("CONFIG_INVALID - Configuration not valid or not loaded");
        }

        if (this.config !== null && this.isConfiguration(this.config)) {
            return this.config;
        }

        return null;
    }
}
