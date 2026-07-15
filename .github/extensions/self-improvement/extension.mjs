import { joinSession } from "@github/copilot-sdk/extension";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createMemory } from "./memory.mjs";
import { loadSettings } from "./settings.mjs";

const settings = await loadSettings();
const memory = await createMemory(settings.storageDirectory);
const extensionDirectory = dirname(fileURLToPath(import.meta.url));
const skillDirectory = join(settings.storageDirectory, "skills");
await mkdir(skillDirectory, { recursive: true });

const skillsGuidance = `
<skillsGuidance>
Skills are your procedural memory: reusable approaches for recurring task types.
New skills go in ${skillDirectory}. Existing skills can be modified wherever they live.
After completing a complex task (5+ tool calls), fixing a tricky error, or discovering a non-trivial workflow, save the approach as a skill so you can reuse it next time.
Use the creating-skills skill when creating or modifying skills.
When using a skill and finding it outdated, incomplete, or wrong, patch it immediately. Skills that aren't maintained become liabilities.
</skillsGuidance>
`.trim();

await joinSession({
    systemMessage: {
        mode: "append",
        content: `${skillsGuidance}\n\n${memory.prompt}`,
    },
    skillDirectories: [
        skillDirectory,
        join(extensionDirectory, "skills"),
    ],
    tools: memory.tools,
});
