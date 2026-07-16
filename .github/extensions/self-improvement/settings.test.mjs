import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { isCopilotMemoryEnabled, loadSettings } from "./settings.mjs";

async function createConfigDirectory(t) {
    const configDirectory = await mkdtemp(
        join(tmpdir(), "copilot-self-improvement-settings-"),
    );
    t.after(() => rm(configDirectory, { recursive: true, force: true }));
    return configDirectory;
}

test("treats Copilot memory as enabled by default", async (t) => {
    const configDirectory = await createConfigDirectory(t);

    assert.equal(await isCopilotMemoryEnabled(configDirectory), true);
});

test("reads the memory setting from settings.json", async (t) => {
    const configDirectory = await createConfigDirectory(t);
    await writeFile(
        join(configDirectory, "settings.json"),
        '{\n  // Copilot settings support JSONC.\n  "memory": false,\n}\n',
        "utf8",
    );

    assert.equal(await isCopilotMemoryEnabled(configDirectory), false);
});

test("gives legacy config.json precedence over settings.json", async (t) => {
    const configDirectory = await createConfigDirectory(t);
    await Promise.all([
        writeFile(
            join(configDirectory, "settings.json"),
            `${JSON.stringify({ memory: false })}\n`,
            "utf8",
        ),
        writeFile(
            join(configDirectory, "config.json"),
            `${JSON.stringify({ memory: true })}\n`,
            "utf8",
        ),
    ]);

    assert.equal(await isCopilotMemoryEnabled(configDirectory), true);
});

test("ignores malformed settings like Copilot does", async (t) => {
    const configDirectory = await createConfigDirectory(t);
    await writeFile(
        join(configDirectory, "settings.json"),
        '{"memory": false',
        "utf8",
    );

    assert.equal(await isCopilotMemoryEnabled(configDirectory), true);
});

test("stores extension settings and data under Copilot home", async (t) => {
    const configDirectory = await createConfigDirectory(t);

    const settings = await loadSettings(configDirectory);
    const settingsPath = join(
        configDirectory,
        "self-improvement",
        "settings.json",
    );

    assert.equal(
        settings.storageDirectory,
        join(configDirectory, "self-improvement", "storage"),
    );
    assert.deepEqual(JSON.parse(await readFile(settingsPath, "utf8")), {
        storageDirectory: "$COPILOT_HOME/self-improvement/storage/",
    });
});

test("expands COPILOT_HOME in configured storage paths", async (t) => {
    const configDirectory = await createConfigDirectory(t);
    const settingsDirectory = join(configDirectory, "self-improvement");
    await mkdir(settingsDirectory, { recursive: true });
    await writeFile(
        join(settingsDirectory, "settings.json"),
        `${JSON.stringify({
            storageDirectory: "$COPILOT_HOME/custom-storage",
        })}\n`,
        "utf8",
    );

    const settings = await loadSettings(configDirectory);

    assert.equal(
        settings.storageDirectory,
        join(configDirectory, "custom-storage"),
    );
});
