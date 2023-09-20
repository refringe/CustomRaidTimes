import Ajv, { ValidateFunction } from "ajv";
import * as fs from "fs";
import { JSONSchema7 } from "json-schema";
import * as json5 from "json5";
import { join } from "path";
import { ConfigSchema } from "../schemas/ConfigSchema";
import { Configuration } from "../types";

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

    private ajv: Ajv;
    private validate: ValidateFunction;
    private configSchema: JSONSchema7;

    /**
     * Constructs a new ConfigServer instance.
     * Automatically loads and validates the configuration file specified by the relative path.
     */
    constructor(relativeConfigPath: string = "../../config/config.json5") {
        this.relativeConfigPath = relativeConfigPath;
        this.configPath = this.buildConfigPath();

        this.ajv = new Ajv();
        this.configSchema = ConfigSchema.schema;
        this.validate = this.ajv.compile(this.configSchema);
    }

    /**
     * Constructs the absolute path to the configuration file based on its relative path.
     */
    private buildConfigPath(): string {
        return join(__dirname, this.relativeConfigPath);
    }

    /**
     * Loads the configuration from a file.
     * Sets the `isLoaded` flag to true if successful, false otherwise.
     * Throws a ConfigError if the file cannot be loaded.
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
     * Validates the loaded configuration.
     * Sets the `isValid` flag to true if the validation is successful, false otherwise.
     * Throws a ConfigError if the configuration is not loaded or is invalid.
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
     * Type guard for the Configuration type.
     */
    private isConfiguration(config: unknown): config is Configuration {
        return this.validate(config) as boolean;
    }

    /**
     * Retrieves the loaded and validated configuration.
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
