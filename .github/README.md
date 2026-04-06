# Custom Raid Times

This is a mod for [Single Player Tarkov](https://www.sp-tarkov.com/).

The scope of this mod is to allow you to adjust your raid times, and have the game still function "normally".

## Features:

-   Adjust global raid times, or raid times for individual maps.
-   Raid times can be random ranges, grouped, and weighted.
-   Extract train schedules automatically adjust to the new raid time.
    -   Earliest arrival time (given enough overall time) can be anywhere in between 35% to 80% of the total raid time, making train arrival less predictable and also more usable in extra long raids.
    -   The number of seconds the train waits before closing the doors and departing is now randomized; but always between 5 and 13 minutes.
    -   Raids can now be as short as 3 minutes and still have an active and functional train extract.
-   Override scav raid times to use your custom times instead of the server's default reduction.
-   Web-based configuration UI accessible.

_\*Many of these options are configurable._

## To Install:

1. Decompress the contents of the download into your root SPT directory.
2. Configure the mod using the web UI at `http://<server-address>/custom-raid-times` (requires the SPT server to be running), or edit `SPT/user/mods/Refringe-CustomRaidTimes/config.json` directly.

If you experience any problems, please [submit a detailed bug report](https://github.com/refringe/CustomRaidTimes/issues).

## To Build Locally:

This project is built with the [.NET 9 SDK](https://dotnet.microsoft.com/download/dotnet/9.0).

To build the project locally:

1. Clone the repository.
2. Run `dotnet build -c Release` in the project root.
3. The distributable zip will be created at `bin/Release/dist/Refringe-CustomRaidTimes.zip`.
