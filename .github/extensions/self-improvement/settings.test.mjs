import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { isCopilotMemoryEnabled } from "./settings.mjs";

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
