#!/usr/bin/env node

import fs from 'fs';
import os from 'os';
import path from 'path';
import archiver from 'archiver';
import winston from 'winston';

const logLevels = {
    error: 0,
    warn: 1,
    info: 2,
    success: 3,
};

const logColors = {
    error: 'red',
    warn: 'yellow',
    info: 'grey',
    success: 'green',
};

winston.addColors(logColors);

const logger = winston.createLogger({
    levels: logLevels,
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(info => {
            return `${info.level}: ${info.message}`;
        })
    ),
    transports: [
        new winston.transports.Console({
            level: 'success', // Set the log level to 'success'
        }),
    ],
});

async function main() {
    const currentDir = getCurrentDirectory();
    const buildIgnorePatterns = await loadBuildIgnoreFile(currentDir);

    const packageJson = await loadPackageJson(currentDir);
    const projectName = createProjectName(packageJson);
    logger.log('success', `Project name created: ${projectName}`);

    const distDir = await cleanAndCreateDistDirectory(currentDir);
    logger.log('success', `Distribution directory cleaned.`);

    const projectDir = await createTemporaryDirectoryWithProjectName(
        projectName
    );
    logger.log('success', `Created temporary working directory: ${projectDir}`);

    logger.log('info', 'Beginning copy operation using .buildignore file...');
    await copyFiles(currentDir, projectDir, buildIgnorePatterns);
    logger.log(
        'success',
        'Files have been successfully copied to temporary directory.'
    );

    logger.log('info', 'Beginning folder compression...');
    const zipFilePath = path.join(
        path.dirname(projectDir),
        `${projectName}.zip`
    );
    await createZipFile(projectDir, zipFilePath, 'user/mods/' + projectName);
    logger.log('success', `Created package: ${zipFilePath}`);

    const zipFileInProjectDir = path.join(projectDir, `${projectName}.zip`);
    await fs.promises.rename(zipFilePath, zipFileInProjectDir);
    logger.log('success', `Moved package: ${zipFileInProjectDir}`);

    await fs.promises.rename(projectDir, path.join(distDir));
    logger.log(
        'success',
        'Relocated temporary directory into project distribution directory.'
    );

    await fs.promises.rm(projectDir, { force: true, recursive: true });
    logger.log('success', 'Cleaned temporary directory.');

    logger.log('success', '------------------------------------');
    logger.log('success', 'Build script completed successfully!');
    logger.log(
        'success',
        "Your mod package has been created in the 'dist' directory:"
    );
    logger.log(
        'success',
        `/${path.relative(
            process.cwd(),
            path.join(distDir, `${projectName}.zip`)
        )}`
    );
    logger.log('success', '------------------------------------');
}

function getCurrentDirectory() {
    return path.dirname(new URL(import.meta.url).pathname);
}

async function loadBuildIgnoreFile(currentDir) {
    const buildIgnorePath = path.join(currentDir, '.buildignore');
    try {
        const fileContent = await fs.promises.readFile(
            buildIgnorePath,
            'utf-8'
        );
        return fileContent.split('\n').filter(pattern => pattern.trim() !== '');
    } catch (err) {
        logger.log(
            'warn',
            'Failed to read .buildignore file. No files or directories will be ignored.'
        );
        return [];
    }
}

async function loadPackageJson(currentDir) {
    const packageJsonPath = path.join(currentDir, 'package.json');
    const packageJsonContent = await fs.promises.readFile(
        packageJsonPath,
        'utf-8'
    );
    return JSON.parse(packageJsonContent);
}

function createProjectName(packageJson) {
    const author = packageJson.author.replace(/\W/g, '').toLowerCase();
    const name = packageJson.name.replace(/\W/g, '').toLowerCase();
    const version = packageJson.version;
    return `${author}-${name}-${version}`;
}

async function cleanAndCreateDistDirectory(projectDir) {
    const distPath = path.join(projectDir, 'dist');
    await fs.promises.rm(distPath, { force: true, recursive: true });

    await fs.promises.mkdir(distPath);
    return distPath;
}

async function createTemporaryDirectoryWithProjectName(projectName) {
    const tempDir = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), 'spt-mod-build-')
    );
    const projectDir = path.join(tempDir, projectName);
    await fs.promises.mkdir(projectDir);
    return projectDir;
}

async function copyFiles(srcDir, destDir, buildIgnorePatterns) {
    try {
        const entries = await fs.promises.readdir(srcDir, {
            withFileTypes: true,
        });

        for (const entry of entries) {
            const srcPath = path.join(srcDir, entry.name);
            const destPath = path.join(destDir, entry.name);
            const relativePath = path.relative(process.cwd(), srcPath);

            if (isIgnored(relativePath, buildIgnorePatterns)) {
                logger.log(
                    'info',
                    `Ignored: /${path.relative(process.cwd(), srcPath)}`
                );
                continue;
            }

            if (entry.isDirectory()) {
                const subentries = await fs.promises.readdir(srcPath, {
                    withFileTypes: true,
                });
                const containsNonIgnoredFiles = subentries.some(subentry => {
                    const subentryPath = path.join(srcPath, subentry.name);
                    const relativeSubentryPath = path.relative(
                        process.cwd(),
                        subentryPath
                    );
                    return !isIgnored(
                        relativeSubentryPath,
                        buildIgnorePatterns
                    );
                });

                if (containsNonIgnoredFiles) {
                    await fs.promises.mkdir(destPath);
                    await copyFiles(srcPath, destPath, buildIgnorePatterns);
                }
            } else {
                await fs.promises.copyFile(srcPath, destPath);
                logger.log(
                    'info',
                    ` Copied: /${path.relative(process.cwd(), srcPath)}`
                );
            }
        }
    } catch (err) {
        logger.log('error', 'Error copying files: ' + err);
    }
}

function isIgnored(filePath, buildIgnorePatterns) {
    let shouldBeIgnored = false;

    for (const pattern of buildIgnorePatterns) {
        const isNegation = pattern.startsWith('!');
        const regexPattern = isNegation ? pattern.slice(1) : pattern;
        let regex;

        if (regexPattern.endsWith('/')) {
            regex = new RegExp(regexPattern.replace('*', '.*') + '.*');
        } else {
            regex = new RegExp(regexPattern.replace('*', '.*'));
        }

        if (regex.test(filePath)) {
            shouldBeIgnored = isNegation ? false : true;
        }
    }

    return shouldBeIgnored;
}

async function createZipFile(directoryToZip, zipFilePath, containerDirName) {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(zipFilePath);
        const archive = archiver('zip', {
            zlib: { level: 9 }, // Sets the compression level.
        });

        output.on('close', function () {
            logger.log(
                'info',
                'Archiver has finalized. The output and the file descriptor have closed.'
            );
            resolve();
        });

        archive.on('warning', function (err) {
            if (err.code === 'ENOENT') {
                logger.log(
                    'warn',
                    `Archiver issued a warning: ${err.code} - ${err.message}`
                );
            } else {
                reject(err);
            }
        });

        archive.on('error', function (err) {
            reject(err);
        });

        archive.pipe(output);
        archive.directory(directoryToZip, containerDirName);
        archive.finalize();
    });
}

// Entry point
main().catch(err => {
    logger.log('error', 'An error occurred: ' + err);
});
