import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

const homeDirectory = homedir();
const settingsDirectory = join(homeDirectory, ".copilot", "self-improvement");
const settingsPath = join(settingsDirectory, "settings.json");
const defaultSettings = {
    storageDirectory: "$HOME/.copilot/self-improvement/storage/",
};

function resolveStorageDirectory(storageDirectory) {
    const expandedPath = storageDirectory.replace(
        /^\$HOME(?=$|[\\/])/,
        homeDirectory,
    );

    if (!isAbsolute(expandedPath)) {
        throw new Error(
            `The "storageDirectory" setting must be an absolute path or start with $HOME.`,
        );
    }

    return resolve(expandedPath);
}

export async function loadSettings() {
    await mkdir(settingsDirectory, { recursive: true });

    let contents;
    try {
        contents = await readFile(settingsPath, "utf8");
    } catch (error) {
        if (error.code !== "ENOENT") {
            throw error;
        }

        await writeFile(settingsPath, `${JSON.stringify(defaultSettings, null, 4)}\n`, "utf8");
        contents = JSON.stringify(defaultSettings);
    }

    let settings;
    try {
        settings = JSON.parse(contents);
    } catch (error) {
        throw new Error(`Invalid JSON in ${settingsPath}`, { cause: error });
    }

    if (
        settings === null ||
        Array.isArray(settings) ||
        typeof settings !== "object" ||
        typeof settings.storageDirectory !== "string" ||
        settings.storageDirectory.trim() === ""
    ) {
        throw new Error(
            `The "storageDirectory" setting in ${settingsPath} must be a non-empty string.`,
        );
    }

    const storageDirectory = resolveStorageDirectory(settings.storageDirectory);
    await mkdir(storageDirectory, { recursive: true });

    return {
        ...settings,
        storageDirectory,
    };
}
