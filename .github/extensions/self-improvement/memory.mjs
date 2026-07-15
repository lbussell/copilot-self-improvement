import { createHash, randomUUID } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadStorageFile } from "./settings.mjs";

const storeFiles = {
    memory: "MEMORY.md",
    user: "USER.md",
};
const entryMarker = "<!-- self-improvement-entry -->";
const entrySeparator = `\n\n${entryMarker}\n\n`;

let updateQueue = Promise.resolve();

export class MemoryStoreError extends Error {
    constructor(message) {
        super(message);
        this.name = "MemoryStoreError";
    }
}

function getStoreFileName(store) {
    const fileName = storeFiles[store];
    if (fileName === undefined) {
        throw new MemoryStoreError(`Unknown memory store: ${store}.`);
    }

    return fileName;
}

function normalizeContent(content, fieldName = "content") {
    if (typeof content !== "string") {
        throw new MemoryStoreError(`Memory ${fieldName} must be a string.`);
    }

    const normalized = content.replace(/\r\n?/g, "\n").trim();
    if (normalized === "") {
        throw new MemoryStoreError(`Memory ${fieldName} must not be empty.`);
    }

    if (normalized.split("\n").some((line) => line.trim() === entryMarker)) {
        throw new MemoryStoreError(
            `Memory ${fieldName} must not contain the reserved entry marker.`,
        );
    }

    return normalized;
}

function parseEntries(contents, fileName) {
    const normalized = contents.replace(/\r\n?/g, "\n");
    if (normalized.trim() === "") {
        return [];
    }

    const entries = [];
    let currentLines = [];

    function appendCurrentEntry() {
        const content = currentLines.join("\n").trim();
        if (content !== "") {
            entries.push(content);
        }
        currentLines = [];
    }

    for (const line of normalized.split("\n")) {
        if (line.trim() === entryMarker) {
            appendCurrentEntry();
        } else {
            currentLines.push(line);
        }
    }
    appendCurrentEntry();

    if (new Set(entries).size !== entries.length) {
        throw new MemoryStoreError(`${fileName} contains duplicate entries.`);
    }

    return entries;
}

function getEntryId(content) {
    return createHash("sha256").update(content).digest("hex");
}

function createEntry(content) {
    return {
        id: getEntryId(content),
        content,
    };
}

function serializeEntries(entries) {
    if (entries.length === 0) {
        return "";
    }

    return `${entries.join(entrySeparator)}\n`;
}

async function writeEntries(filePath, entries) {
    const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;

    try {
        await writeFile(temporaryPath, serializeEntries(entries), {
            encoding: "utf8",
            flag: "wx",
        });
        await rename(temporaryPath, filePath);
    } finally {
        await rm(temporaryPath, { force: true });
    }
}

function queueUpdate(operation) {
    const result = updateQueue.then(operation, operation);
    updateQueue = result.then(
        () => undefined,
        () => undefined,
    );
    return result;
}

function validateChanges(changes) {
    if (!Array.isArray(changes) || changes.length === 0) {
        throw new MemoryStoreError("Memory changes must be a non-empty array.");
    }
}

function findEntryIndex(entries, id, changeIndex) {
    if (typeof id !== "string" || id === "") {
        throw new MemoryStoreError(`Change ${changeIndex} requires an entry id.`);
    }

    const entryIndex = entries.findIndex((entry) => getEntryId(entry) === id);
    if (entryIndex === -1) {
        throw new MemoryStoreError(
            `Change ${changeIndex} references an entry that does not exist.`,
        );
    }

    return entryIndex;
}

function applyChanges(entries, changes) {
    const updatedEntries = [...entries];

    for (const [index, change] of changes.entries()) {
        const changeIndex = index + 1;
        if (change === null || Array.isArray(change) || typeof change !== "object") {
            throw new MemoryStoreError(`Change ${changeIndex} must be an object.`);
        }

        switch (change.type) {
            case "add": {
                const content = normalizeContent(change.content, `change ${changeIndex} content`);
                if (updatedEntries.includes(content)) {
                    throw new MemoryStoreError(
                        `Change ${changeIndex} would add a duplicate entry.`,
                    );
                }
                updatedEntries.push(content);
                break;
            }
            case "replace": {
                const entryIndex = findEntryIndex(updatedEntries, change.id, changeIndex);
                const content = normalizeContent(change.content, `change ${changeIndex} content`);
                if (
                    updatedEntries.some(
                        (entry, currentIndex) =>
                            currentIndex !== entryIndex && entry === content,
                    )
                ) {
                    throw new MemoryStoreError(
                        `Change ${changeIndex} would create a duplicate entry.`,
                    );
                }
                updatedEntries[entryIndex] = content;
                break;
            }
            case "remove": {
                const entryIndex = findEntryIndex(updatedEntries, change.id, changeIndex);
                updatedEntries.splice(entryIndex, 1);
                break;
            }
            default:
                throw new MemoryStoreError(
                    `Change ${changeIndex} has an unknown type: ${change.type}.`,
                );
        }
    }

    return updatedEntries;
}

export async function readMemoryStore(storageDirectory, store) {
    const fileName = getStoreFileName(store);
    const contents = await loadStorageFile(storageDirectory, fileName);
    return parseEntries(contents, fileName).map(createEntry);
}

export async function updateMemoryStore(storageDirectory, store, changes) {
    validateChanges(changes);
    const fileName = getStoreFileName(store);
    const filePath = join(storageDirectory, fileName);

    return queueUpdate(async () => {
        const contents = await loadStorageFile(storageDirectory, fileName);
        const entries = parseEntries(contents, fileName);
        const updatedEntries = applyChanges(entries, changes);
        await writeEntries(filePath, updatedEntries);
        return updatedEntries.map(createEntry);
    });
}

const memoryGuidance = `
<memoryGuidance>
You have persistent memory across sessions. Save durable facts using the memory tool: user preferences, environment details, tool quirks, and stable conventions. Memory is injected into every turn, so keep it compact and focused on facts that will still matter later.
Prioritize what reduces future user steering. The most valuable memory is one that prevents the user from having to correct or remind you again. User preferences and recurring corrections matter more than procedural task details.
Do not save task progress, session outcomes, completed-work logs, or temporary TODO state to memory. If a fact will be stale in a week, it does not belong in memory.
Write memories as declarative facts, not instructions to yourself. Examples: 'User prefers concise responses', 'Project uses pytest with xdist'. Imperative phrasing gets re-read as a directive in later sessions and can cause repeated work or override the user's current request. Procedures and workflows belong in skills, not memory.
Targets: 'user' = who the user is (name, role, preferences, style). 'memory' = your notes (environment, conventions, tool quirks, lessons).
</memoryGuidance>
`.trim();

function escapeXml(content) {
    return content
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

export function buildMemoryPrompt(memoryEntries, userEntries) {
    const memories = memoryEntries
        .map((entry) => `<memory>${escapeXml(entry.content)}</memory>`)
        .join("\n");
    const userInfo = userEntries
        .map((entry) => escapeXml(entry.content))
        .join("\n");

    return `
${memoryGuidance}

<memories>
${memories}
</memories>
<userInfo>
${userInfo}
</userInfo>
`.trim();
}

async function runMemoryTool(operation) {
    try {
        return JSON.stringify(await operation(), null, 4);
    } catch (error) {
        if (!(error instanceof MemoryStoreError)) {
            throw error;
        }

        return {
            textResultForLlm: error.message,
            resultType: "failure",
        };
    }
}

function createMemoryTools(storageDirectory) {
    return [
        {
            name: "memory_list",
            description:
                "Lists persistent memory entries and their content-derived IDs. Use store='memory' for environment and workflow facts, store='user' for user preferences and profile facts, or store='all' for both.",
            parameters: {
                type: "object",
                properties: {
                    store: {
                        type: "string",
                        enum: ["memory", "user", "all"],
                        description: "The memory store to list.",
                        default: "all",
                    },
                },
                additionalProperties: false,
            },
            handler: async (args) =>
                runMemoryTool(async () => {
                    const store = args.store ?? "all";
                    const stores = store === "all" ? ["memory", "user"] : [store];
                    const results = await Promise.all(
                        stores.map((requestedStore) =>
                            readMemoryStore(storageDirectory, requestedStore),
                        ),
                    );

                    return Object.fromEntries(
                        stores.map((requestedStore, index) => [
                            requestedStore,
                            results[index],
                        ]),
                    );
                }),
        },
        {
            name: "memory_update",
            description:
                "Atomically adds, replaces, or removes persistent memory entries. Use IDs from memory_list for replace and remove operations. Changes persist for future sessions; the current session prompt is not rebuilt.",
            parameters: {
                type: "object",
                properties: {
                    store: {
                        type: "string",
                        enum: ["memory", "user"],
                        description: "The memory store to update.",
                    },
                    changes: {
                        type: "array",
                        minItems: 1,
                        description:
                            "Changes applied in order. Add requires content; replace requires id and content; remove requires id.",
                        items: {
                            type: "object",
                            properties: {
                                type: {
                                    type: "string",
                                    enum: ["add", "replace", "remove"],
                                },
                                id: {
                                    type: "string",
                                    minLength: 1,
                                    description:
                                        "Content-derived entry ID from memory_list.",
                                },
                                content: {
                                    type: "string",
                                    minLength: 1,
                                    description: "The new memory content.",
                                },
                            },
                            required: ["type"],
                            additionalProperties: false,
                        },
                    },
                },
                required: ["store", "changes"],
                additionalProperties: false,
            },
            handler: async (args) =>
                runMemoryTool(() =>
                    updateMemoryStore(
                        storageDirectory,
                        args.store,
                        args.changes,
                    ),
                ),
        },
    ];
}

export async function createMemory(storageDirectory) {
    const [memoryEntries, userEntries] = await Promise.all([
        readMemoryStore(storageDirectory, "memory"),
        readMemoryStore(storageDirectory, "user"),
    ]);

    return {
        paths: Object.fromEntries(
            Object.entries(storeFiles).map(([store, fileName]) => [
                store,
                join(storageDirectory, fileName),
            ]),
        ),
        prompt: buildMemoryPrompt(memoryEntries, userEntries),
        tools: createMemoryTools(storageDirectory),
    };
}
