import { DependencyContainer } from "tsyringe";
import { RouteAction } from "../../../di/Router";
export declare class DynamicRouterModService {
    private container;
    constructor(container: DependencyContainer);
    registerDynamicRouter(name: string, routes: RouteAction[], topLevelRoute: string): void;
}
