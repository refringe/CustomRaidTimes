import type { IPostDBLoadModAsync } from '@spt-aki/models/external/IPostDBLoadModAsync';
import type { IPreAkiLoadModAsync } from '@spt-aki/models/external/IPreAkiLoadModAsync';
import type { StaticRouterModService } from '@spt-aki/services/mod/staticRouter/StaticRouterModService';
import { DependencyContainer } from 'tsyringe';
import { loadAndValidateConfig } from './config';
import { adjustRaids } from './raids';
import type { Configuration } from './types';
import { getLogger } from './utils/logger';

/**
 * The main class of the CustomRaidTimes mod.
 */
class CustomRaidTimes implements IPostDBLoadModAsync, IPreAkiLoadModAsync {
    private config: Configuration | null = null;

    public async initialize(container: DependencyContainer): Promise<void> {
        try {
            this.config = await loadAndValidateConfig();
            if (!this.config.general.enabled) {
                const logger = getLogger(container);
                logger.log('CustomRaidTimes is disabled in the config file.', 'red');
                this.config = null; // Set config to null to indicate the mod is disabled
            }
        } catch (error) {
            const logger = getLogger(container);
            logger.log(
                'CustomRaidTimes: An error occurred while loading or validating the configuration file. ' +
                    error.message,
                'red'
            );
        }
    }

    private async initializeIfNeeded(container: DependencyContainer): Promise<boolean> {
        if (this.config === null) await this.initialize(container);
        return this.config !== null;
    }

    public async preAkiLoadAsync(container: DependencyContainer): Promise<void> {
        if (!(await this.initializeIfNeeded(container))) return;

        const logger = getLogger(container);

        // Hook into the match end route to recalculate the raid times.
        const staticRouterModService = container.resolve<StaticRouterModService>('StaticRouterModService');
        staticRouterModService.registerStaticRouter(
            'CustomRaidTimesMatchEnd',
            [
                {
                    url: '/client/match/offline/end',
                    action: (url, info, sessionId, output) => {
                        if (this.config!.general.debug)
                            logger.log('CustomRaidTimes: CustomRaidTimesMatchEnd route has been triggered.', 'gray');

                        adjustRaids(container, this.config!);
                        return output;
                    },
                },
            ],
            'CustomRaidTimesMatchEnd'
        );
    }

    public async postDBLoadAsync(container: DependencyContainer): Promise<void> {
        if (!(await this.initializeIfNeeded(container))) return;

        adjustRaids(container, this.config!);
    }
}

module.exports = { mod: new CustomRaidTimes() };
