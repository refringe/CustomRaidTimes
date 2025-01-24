# Open Extracts

This is a mod for [Single Player Tarkov](https://www.sp-tarkov.com/).

The scope of this mod is to allow the you to adjust your raid times, and have the game still function "normally".

## Features:

-   Adjust global raid times, or raid times for individual maps.
-   Raid times can be random ranges, grouped, and weighted.
-   Extract train schedules automatically adjust to the new raid time.
    -   Earliest arrival time (given enough overall time) can be anywhere in between 35% to 80% of the total raid time, making train arrival less predictable and also more usable in extra long raids.
    -   The number of seconds the train waits before closing the doors and departing is now randomized; but always between 14 and 7 minutes.
    -   Raids can now be as short as 3 minutes and still have an active and functional train extract.

_\*Many of these options are configurable._

## To install:

1. Decompress the contents of the download into your root SPT directory.
2. Open the `refringe-customraidtimes/config/config.json5` file to adjust configuration options.
3. Leave a review and let me know what you think.

If you experience any problems, please [submit a detailed bug report](https://github.com/refringe/CustomRaidTimes/issues).

## To Build Locally:

This project has been built in [Visual Studio Code](https://code.visualstudio.com/) (VSC) using [Node.js](https://nodejs.org/). If you are unfamiliar with Node.js, I recommend using [NVM](https://github.com/nvm-sh/nvm) to manage installation and switching versions. If you do not wish to use NVM, you will need to install the version of Node.js listed within the `.nvmrc` file manually.

This project uses Biome to format code on save.

To build the project locally:

1. Clone the repository.
2. Open the `mod.code-workspace` file in Visual Studio Code (VSC).
3. Run `nvm use` in the terminal.
4. Run `npm install` in the terminal.
5. Run `npm run build` in the terminal.
