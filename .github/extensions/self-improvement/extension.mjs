import { joinSession } from "@github/copilot-sdk/extension";

const memory = "";

await joinSession({
    systemMessage: {
        mode: "append",
        content: `<memory>${memory}</memory>`,
    },
});
