import { joinSession } from "@github/copilot-sdk/extension";
import { createMemory } from "./memory.mjs";
import { loadSettings } from "./settings.mjs";

const settings = await loadSettings();
const memory = await createMemory(settings.storageDirectory);

await joinSession({
    systemMessage: {
        mode: "append",
        content: memory.prompt,
    },
    tools: memory.tools,
});
