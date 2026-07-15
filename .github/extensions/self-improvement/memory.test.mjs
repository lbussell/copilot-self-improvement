import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
    buildMemoryPrompt,
    createMemory,
    MemoryStoreError,
    readMemoryStore,
    updateMemoryStore,
} from "./memory.mjs";

async function createStorage(t) {
    const storageDirectory = await mkdtemp(
        join(tmpdir(), "copilot-self-improvement-"),
    );
    t.after(() => rm(storageDirectory, { recursive: true, force: true }));
    return storageDirectory;
}

test("adds, replaces, and removes memory entries", async (t) => {
    const storageDirectory = await createStorage(t);

    const added = await updateMemoryStore(storageDirectory, "memory", [
        { type: "add", content: "Uses PowerShell." },
        { type: "add", content: "Prefers concise output." },
    ]);
    assert.equal(added.length, 2);

    const replaced = await updateMemoryStore(storageDirectory, "memory", [
        {
            type: "replace",
            id: added[0].id,
            content: "Uses PowerShell on Windows.",
        },
        {
            type: "remove",
            id: added[1].id,
        },
    ]);

    assert.deepEqual(
        replaced.map((entry) => entry.content),
        ["Uses PowerShell on Windows."],
    );

    const reloaded = await readMemoryStore(storageDirectory, "memory");
    assert.deepEqual(reloaded, replaced);
});

test("does not write a partially valid batch", async (t) => {
    const storageDirectory = await createStorage(t);
    const initial = await updateMemoryStore(storageDirectory, "memory", [
        { type: "add", content: "Existing entry." },
    ]);
    const memoryPath = join(storageDirectory, "MEMORY.md");
    const before = await readFile(memoryPath, "utf8");

    await assert.rejects(
        updateMemoryStore(storageDirectory, "memory", [
            { type: "remove", id: initial[0].id },
            { type: "add", content: "" },
        ]),
        MemoryStoreError,
    );

    assert.equal(await readFile(memoryPath, "utf8"), before);
});

test("serializes concurrent updates without losing entries", async (t) => {
    const storageDirectory = await createStorage(t);

    await Promise.all([
        updateMemoryStore(storageDirectory, "memory", [
            { type: "add", content: "First concurrent entry." },
        ]),
        updateMemoryStore(storageDirectory, "memory", [
            { type: "add", content: "Second concurrent entry." },
        ]),
    ]);

    const memory = await readMemoryStore(storageDirectory, "memory");
    assert.deepEqual(
        memory.map((entry) => entry.content),
        ["First concurrent entry.", "Second concurrent entry."],
    );
});

test("renders entries individually and escapes XML", () => {
    const prompt = buildMemoryPrompt(
        [
            { content: "First memory." },
            { content: "Uses <xml> & text." },
        ],
        [{ content: "Prefers > comparisons." }],
    );

    assert.ok(prompt.startsWith("<memoryGuidance>"));
    assert.match(prompt, /Targets: 'user' = who the user is/);
    assert.ok(
        prompt.endsWith(
            `<memories>
<memory>First memory.</memory>
<memory>Uses &lt;xml&gt; &amp; text.</memory>
</memories>
<userInfo>
Prefers &gt; comparisons.
</userInfo>`,
        ),
    );
});

test("creates the memory prompt and tools together", async (t) => {
    const storageDirectory = await createStorage(t);
    const memory = await createMemory(storageDirectory);

    assert.deepEqual(
        memory.tools.map((tool) => tool.name),
        ["memory_list", "memory_update"],
    );
    assert.deepEqual(memory.paths, {
        memory: join(storageDirectory, "MEMORY.md"),
        user: join(storageDirectory, "USER.md"),
    });
    assert.deepEqual(
        JSON.parse(await memory.tools[0].handler({ store: "all" })),
        {
            memory: [],
            user: [],
        },
    );
    assert.ok(memory.prompt.startsWith("<memoryGuidance>"));
    assert.ok(
        memory.prompt.endsWith(
            `<memories>

</memories>
<userInfo>

</userInfo>`,
        ),
    );
});
