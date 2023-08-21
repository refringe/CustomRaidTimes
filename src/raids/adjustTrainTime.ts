import type { Exit } from '@spt-aki/models/eft/common/ILocationBase';
import type { ILocationData } from '@spt-aki/models/spt/server/ILocations';
import type { ILogger } from '@spt-aki/models/spt/utils/ILogger';
import type { Configuration } from '../types';
import { getHumanLocationName } from '../utils/locations';

const ANIMATE_SEC = 97;
const MIN_WAIT_SEC = 60;
const BUFFER_SEC = 300;
const RANDOM_WAIT_MIN_SEC = 5;
const RANDOM_WAIT_MAX_SEC = 14;
const ARRIVE_RANDOM_RANGE_SEC = 300;
const BUFFER_ADJUSTMENT_MAX_PERCENT = 0.65;
const BUFFER_ADJUSTMENT_MIN_PERCENT = 0.2;

/**
 * Main entry point for adjusting the train times. Checks to see if the exit is a train exit, and if so, calls the
 * appropriate function to handle the logic.
 */
export function adjustTrainTime(location: ILocationData, config: Configuration, logger: ILogger): void {
    location.base.exits.forEach(exit => {
        if (exit.PassageRequirement?.toLowerCase() === 'train') {
            adjustTrainExit(exit, location, config, logger);
        }
    });
}

/**
 * Handles the brunt of the logic for adjusting the train times.
 */
function adjustTrainExit(exit: Exit, location: ILocationData, config: Configuration, logger: ILogger): void {
    const raidTimeSec = location.base.EscapeTimeLimit * 60;
    const trainExtractWaitSec = exit.ExfiltrationTime;
    let trainWaitSec = getRandomTrainWaitTime();
    let [trainArriveEarliest, trainArriveLatest] = getInitialTrainArrivalTimes(
        raidTimeSec,
        trainExtractWaitSec,
        trainWaitSec
    );

    // Ensure the earliest arrival time is valid.
    trainArriveEarliest = validateEarliestArrivalTime(trainArriveEarliest);

    // Ensure the latest arrival time is valid.
    if (trainArriveLatest <= 0) {
        [trainArriveEarliest, trainArriveLatest, trainWaitSec] = adjustForLateTrain(
            trainArriveLatest,
            trainWaitSec,
            raidTimeSec,
            trainExtractWaitSec
        );

        // We tried, but the train is going too be late. Warn the user.
        if (trainArriveLatest < 0) {
            logger.log(
                `CustomRaidTimes: ${getHumanLocationName(
                    location.base.Id
                )} Train Schedule - Train cannot depart before the end of the raid. Raid time is too short.`,
                'yellow'
            );
        }
    }

    // If there is enough available time, shift the earliest arrival time to 65%-20% of the available time (a minimum of 1 minute).
    if (trainArriveEarliest > BUFFER_SEC) {
        trainArriveEarliest -= getAdjustmentTime(trainArriveEarliest);
    }

    // Set the new train times.
    exit.MinTime = trainArriveEarliest;
    exit.MaxTime = trainArriveLatest;
    exit.Count = trainWaitSec;

    if (config.general.debug) {
        logger.log(
            `CustomRaidTimes: ${getHumanLocationName(location.base.Id)} Train Schedule - Earliest: ${(
                trainArriveEarliest / 60
            ).toFixed(2)} minutes, Latest: ${(trainArriveLatest / 60).toFixed(2)} minutes, Wait: ${(
                trainWaitSec / 60
            ).toFixed(2)} minutes.`,
            'gray'
        );
    }
}

/**
 * Calculates the initial earliest and latest train arrival times.
 */
function getInitialTrainArrivalTimes(
    raidTimeSec: number,
    trainExtractWaitSec: number,
    trainWaitSec: number
): [number, number] {
    const latestArrival = raidTimeSec - ANIMATE_SEC - trainExtractWaitSec - trainWaitSec;
    let earliestArrival = latestArrival - ARRIVE_RANDOM_RANGE_SEC;
    if (latestArrival > 0 && earliestArrival < 0) {
        earliestArrival = 0;
    }
    return [earliestArrival, latestArrival];
}

/**
 * Validates that the earliest train arrival time is set to zero (arrives immediately) when it's less than zero.
 */
function validateEarliestArrivalTime(trainArriveEarliest: number): number {
    if (trainArriveEarliest < 0) {
        trainArriveEarliest = 0;
    }
    return trainArriveEarliest;
}

/**
 * Lower the latest arrival time until it is no longer too late.
 */
function adjustForLateTrain(
    trainArriveLatest: number,
    trainWaitSec: number,
    raidTimeSec: number,
    trainExtractWaitSec: number
): [number, number, number] {
    const trainArriveEarliest = 0;
    do {
        trainWaitSec--;
        trainArriveLatest = getLatestTrainArrivalTime(raidTimeSec, trainExtractWaitSec, trainWaitSec);
    } while (trainArriveLatest < 0 && trainWaitSec > MIN_WAIT_SEC);
    return [trainArriveEarliest, trainArriveLatest, trainWaitSec];
}

/**
 * Calculates the number of seconds the train waits before closing the doors and departing.
 * The default is random between 14 and 5 minutes.
 */
function getRandomTrainWaitTime(): number {
    return 60 * Math.floor(Math.random() * (RANDOM_WAIT_MAX_SEC - RANDOM_WAIT_MIN_SEC) + RANDOM_WAIT_MIN_SEC);
}

/**
 * Calculates the initial latest train arrival time based on other time figures.
 */
function getLatestTrainArrivalTime(raidTimeSec: number, trainExtractWaitSec: number, trainWaitSec: number): number {
    return raidTimeSec - ANIMATE_SEC - trainExtractWaitSec - trainWaitSec;
}

/**
 * Adjust the earliest arrival time to 65%-20% of the available time; a minimum of 1 minute.
 */
function getAdjustmentTime(trainArriveEarliest: number): number {
    const adjustmentPercentage = parseFloat(
        (
            Math.random() * (BUFFER_ADJUSTMENT_MAX_PERCENT - BUFFER_ADJUSTMENT_MIN_PERCENT) +
            BUFFER_ADJUSTMENT_MIN_PERCENT
        ).toFixed(2)
    );
    return Math.floor(trainArriveEarliest * adjustmentPercentage);
}
