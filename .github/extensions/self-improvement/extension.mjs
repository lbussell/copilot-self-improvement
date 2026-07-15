import { joinSession } from "@github/copilot-sdk/extension";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
    buildCurationReviewPrompt,
    createPeriodicCurationReview,
    defaultReviewInterval,
    formatRecentConversation,
} from "./curation.mjs";
import { createMemory } from "./memory.mjs";
import { loadSettings } from "./settings.mjs";

const settings = await loadSettings();
const memory = await createMemory(settings.storageDirectory);
const extensionDirectory = dirname(fileURLToPath(import.meta.url));
const skillDirectory = join(settings.storageDirectory, "skills");
const bundledSkillDirectory = join(extensionDirectory, "skills");
await mkdir(skillDirectory, { recursive: true });
const curationReview = createPeriodicCurationReview();
let reviewPending = false;
let reviewInProgress = false;
let reviewAgentId;
let session;

const skillsGuidance = `
<skillsGuidance>
Skills are your procedural memory: reusable approaches for recurring task types.
New skills go in ${skillDirectory}. Existing skills can be modified wherever they live.
After completing a complex task (5+ tool calls), fixing a tricky error, or discovering a non-trivial workflow, save the approach as a skill so you can reuse it next time.
Use the creating-skills skill when creating or modifying skills.
When using a skill and finding it outdated, incomplete, or wrong, patch it immediately. Skills that aren't maintained become liabilities.
</skillsGuidance>
`.trim();

session = await joinSession({
    systemMessage: {
        mode: "append",
        content: `${skillsGuidance}\n\n${memory.prompt}`,
    },
    hooks: {
        onUserPromptSubmitted: (input, invocation) => {
            if (
                input.sessionId === invocation.sessionId &&
                curationReview.shouldRunReview()
            ) {
                reviewPending = true;
            }
        },
    },
    skillDirectories: [
        skillDirectory,
        bundledSkillDirectory,
    ],
    tools: memory.tools,
});

await session.log(
    [
        `Self-improvement enabled (reviews every ${defaultReviewInterval} turns)`,
        `Skills: ${skillDirectory}`,
        `Memory: ${memory.paths.memory}`,
        `User: ${memory.paths.user}`,
    ].join("\n"),
    { ephemeral: true },
);

async function runReview() {
    reviewInProgress = true;

    try {
        const conversation = formatRecentConversation(
            await session.getEvents(),
        );
        await session.log("Starting periodic self-improvement review agent", {
            ephemeral: true,
        });
        const result = await session.rpc.tasks.startAgent({
            agentType: "general-purpose",
            name: "self-improvement-review",
            description: "Review recent turns for durable memory and skills",
            prompt: buildCurationReviewPrompt(skillDirectory, conversation),
        });
        reviewAgentId = result.agentId;
    } catch (error) {
        reviewInProgress = false;
        const message = error instanceof Error ? error.message : String(error);
        await session.log(
            `Periodic self-improvement review failed to start: ${message}`,
            { level: "warning", ephemeral: true },
        );
    }
}

session.on("session.idle", () => {
    if (!reviewPending || reviewInProgress) {
        return;
    }

    reviewPending = false;
    void runReview();
});

session.on("system.notification", async (event) => {
    const notification = event.data.kind;
    if (
        reviewAgentId === undefined ||
        notification.agentId !== reviewAgentId ||
        (notification.type !== "agent_completed" &&
            notification.type !== "agent_idle")
    ) {
        return;
    }

    const completedAgentId = reviewAgentId;
    reviewAgentId = undefined;
    reviewInProgress = false;

    if (
        notification.type === "agent_completed" &&
        notification.status === "failed"
    ) {
        await session.log("Periodic self-improvement review agent failed", {
            level: "warning",
            ephemeral: true,
        });
        return;
    }

    await session.log("Periodic self-improvement review agent complete", {
        ephemeral: true,
    });

    if (notification.type === "agent_idle") {
        await session.rpc.tasks.cancel({ id: completedAgentId });
    }
});
