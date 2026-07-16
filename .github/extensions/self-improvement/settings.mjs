import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

const homeDirectory = homedir();
const copilotSettingsDirectory = resolve(
    process.env.COPILOT_HOME || join(homeDirectory, ".copilot"),
);
const defaultSettings = {
    storageDirectory: "$COPILOT_HOME/self-improvement/storage/",
};

function removeJsonComments(contents) {
    let result = "";
    let inString = false;
    let escaped = false;

    for (let index = 0; index < contents.length; index += 1) {
        const character = contents[index];
        const nextCharacter = contents[index + 1];

        if (inString) {
            result += character;
            if (escaped) {
                escaped = false;
            } else if (character === "\\") {
                escaped = true;
            } else if (character === '"') {
                inString = false;
            }
            continue;
        }

        if (character === '"') {
            inString = true;
            result += character;
            continue;
        }

        if (character === "/" && nextCharacter === "/") {
            while (
                index < contents.length &&
                contents[index] !== "\n" &&
                contents[index] !== "\r"
            ) {
                index += 1;
            }
            index -= 1;
            continue;
        }

        if (character === "/" && nextCharacter === "*") {
            index += 2;
            while (
                index < contents.length &&
                !(contents[index] === "*" && contents[index + 1] === "/")
            ) {
                if (contents[index] === "\n" || contents[index] === "\r") {
                    result += contents[index];
                }
                index += 1;
            }
            index += 1;
            continue;
        }

        result += character;
    }

    return result;
}

function removeTrailingCommas(contents) {
    let result = "";
    let inString = false;
    let escaped = false;

    for (let index = 0; index < contents.length; index += 1) {
        const character = contents[index];

        if (inString) {
            result += character;
            if (escaped) {
                escaped = false;
            } else if (character === "\\") {
                escaped = true;
            } else if (character === '"') {
                inString = false;
            }
            continue;
        }

        if (character === '"') {
            inString = true;
            result += character;
            continue;
        }

        if (character === ",") {
            let nextIndex = index + 1;
            while (/\s/.test(contents[nextIndex] ?? "")) {
                nextIndex += 1;
            }
            if (contents[nextIndex] === "}" || contents[nextIndex] === "]") {
                continue;
            }
        }

        result += character;
    }

    return result;
}

async function loadJsonObject(filePath) {
    let contents;
    try {
        contents = await readFile(filePath, "utf8");
    } catch (error) {
        if (error.code === "ENOENT") {
            return undefined;
        }
        throw error;
    }

    try {
        const value = JSON.parse(
            removeTrailingCommas(removeJsonComments(contents)),
        );
        return value !== null && !Array.isArray(value) && typeof value === "object"
            ? value
            : undefined;
    } catch {
        return undefined;
    }
}

function resolveStorageDirectory(
    storageDirectory,
    configDirectory = copilotSettingsDirectory,
) {
    const expandedPath = storageDirectory
        .replace(/^\$COPILOT_HOME(?=$|[\\/])/, configDirectory)
        .replace(/^\$HOME(?=$|[\\/])/, homeDirectory);

    if (!isAbsolute(expandedPath)) {
        throw new Error(
            `The "storageDirectory" setting must be an absolute path or start with $COPILOT_HOME or $HOME.`,
        );
    }

    return resolve(expandedPath);
}

export async function loadStorageFile(storageDirectory, fileName) {
    const filePath = join(storageDirectory, fileName);

    try {
        return await readFile(filePath, "utf8");
    } catch (error) {
        if (error.code !== "ENOENT") {
            throw error;
        }

        await writeFile(filePath, "", "utf8");
        return "";
    }
}

export async function isCopilotMemoryEnabled(
    configDirectory = copilotSettingsDirectory,
) {
    const [settings, legacyConfig] = await Promise.all([
        loadJsonObject(join(configDirectory, "settings.json")),
        loadJsonObject(join(configDirectory, "config.json")),
    ]);
    const configuredValue =
        (typeof legacyConfig?.memory === "boolean"
            ? legacyConfig.memory
            : undefined) ??
        (typeof settings?.memory === "boolean" ? settings.memory : undefined);

    return configuredValue ?? true;
}

export async function loadSettings(configDirectory = copilotSettingsDirectory) {
    const settingsDirectory = join(configDirectory, "self-improvement");
    const settingsPath = join(settingsDirectory, "settings.json");
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

    const storageDirectory = resolveStorageDirectory(
        settings.storageDirectory,
        configDirectory,
    );
    await mkdir(storageDirectory, { recursive: true });

    return {
        ...settings,
        storageDirectory,
    };
}
