import { joinSession } from "@github/copilot-sdk/extension";
import { loadSettings, loadStorageFile } from "./settings.mjs";

const settings = await loadSettings();

const [memory, userInfo] = await Promise.all([
    loadStorageFile(settings.storageDirectory, "MEMORY.md"),
    loadStorageFile(settings.storageDirectory, "USER.md"),
]);

const prompt = `
<memory>
${memory}
</memory>
<userInfo>
${userInfo}
</userInfo>
`.trim();

await joinSession({
    systemMessage: {
        mode: "append",
        content: prompt,
    },
});
