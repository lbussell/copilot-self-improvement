import { joinSession } from "@github/copilot-sdk/extension";
import { loadSettings } from "./settings.mjs";

const settings = await loadSettings();

const memory = "";

await joinSession({
    systemMessage: {
        mode: "append",
        content: `<memory>${memory}</memory>`,
    },
});
