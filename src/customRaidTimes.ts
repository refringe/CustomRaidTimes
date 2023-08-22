import { IPostDBLoadModAsync } from '@spt-aki/models/external/IPostDBLoadModAsync';
import { IPreAkiLoadModAsync } from '@spt-aki/models/external/IPreAkiLoadModAsync';
import { StaticRouterModService } from '@spt-aki/services/mod/staticRouter/StaticRouterModService';
import { DependencyContainer } from 'tsyringe';
import { getConfig } from './config';
import { adjustRaids } from './raids';
import { Configuration } from './types';
import { getLogger } from './utils/logger';

/**
 * CustomRaidTimes mod.
 */
class CustomRaidTimes implements IPostDBLoadModAsync, IPreAkiLoadModAsync {
    private config: Configuration | null = null;

    /**
     * Handle the configuration file, and register any routes.
     * Runs first!
     */
    public async preAkiLoadAsync(container: DependencyContainer): Promise<void> {
        // Make sure that the configuration file has been loaded.
        this.config = await getConfig(container);

        const logger = getLogger(container);

        // Register a static route for the end of a raid so that the raid times can be adjusted.
        const staticRouterModService = container.resolve<StaticRouterModService>('StaticRouterModService');
        staticRouterModService.registerStaticRouter(
            'CustomRaidTimesMatchEnd',
            [
                {
                    url: '/client/match/offline/end',
                    action: (url, info, sessionId, output) => {
                        if (this.config!.general.debug) {
                            logger.log('CustomRaidTimes: CustomRaidTimesMatchEnd route has been triggered.', 'gray');
                        }

                        adjustRaids(container, this.config!);
                        return output;
                    },
                },
            ],
            'CustomRaidTimesMatchEnd'
        );
    }

    /**
     * Adjust the raids on server start, once the database has been loaded.
     */
    public async postDBLoadAsync(container: DependencyContainer): Promise<void> {
        // The only way that the configuration is null at this point is if it's failed to load or validate.
        if (this.config === null) {
            return;
        }
        
        adjustRaids(container, this.config!);
    }
}

module.exports = { mod: new CustomRaidTimes() };
