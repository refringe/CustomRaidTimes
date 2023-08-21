import type { ILogger } from '@spt-aki/models/spt/utils/ILogger';
import type { DependencyContainer } from 'tsyringe';

/**
 * Gets the logger from the container.
 */
export function getLogger(container: DependencyContainer): ILogger {
    return container.resolve<ILogger>('WinstonLogger');
}
