import assert from "node:assert/strict";
import test from "node:test";
import {
    buildCurationReviewPrompt,
    buildFullSessionCurationReviewPrompt,
    createPeriodicCurationReview,
    formatRecentConversation,
    getFileChanges,
    parseReflectArgument,
} from "./curation.mjs";

test("parses reflect command scopes", () => {
    assert.equal(parseReflectArgument(""), 10);
    assert.equal(parseReflectArgument(" 25 "), 25);
    assert.equal(parseReflectArgument("ALL"), "all");
    assert.throws(
        () => parseReflectArgument("0"),
        /positive number of turns/,
    );
    assert.throws(
        () => parseReflectArgument("several"),
        /positive number of turns/,
    );
});

test("triggers a review every tenth turn", () => {
    const review = createPeriodicCurationReview();

    for (let index = 0; index < 9; index += 1) {
        assert.equal(review.shouldRunReview(), false);
    }
    assert.equal(review.shouldRunReview(), true);

    for (let index = 0; index < 9; index += 1) {
        assert.equal(review.shouldRunReview(), false);
    }
    assert.equal(review.shouldRunReview(), true);
});

test("formats the ten most recent foreground turns", () => {
    const events = [];
    for (let index = 1; index <= 11; index += 1) {
        events.push({
            type: "user.message",
            data: { content: `Question ${index}` },
        });
        if (index === 11) {
            events.push({
                type: "tool.execution_start",
                data: {
                    toolCallId: "tool-success",
                    toolName: "view",
                    arguments: { path: "README.md" },
                },
            });
            events.push({
                type: "tool.execution_complete",
                data: {
                    toolCallId: "tool-success",
                    success: true,
                    result: {
                        content: "Short output",
                        detailedContent: "Complete README contents",
                    },
                },
            });
            events.push({
                type: "tool.execution_start",
                data: {
                    toolCallId: "tool-failure",
                    toolName: "powershell",
                    arguments: { command: "missing-command" },
                },
            });
            events.push({
                type: "tool.execution_complete",
                data: {
                    toolCallId: "tool-failure",
                    success: false,
                    error: {
                        code: "ENOENT",
                        message: "Command was not found",
                    },
                },
            });
        }
        events.push({
            type: "assistant.message",
            data: { content: `Answer ${index}` },
        });
    }
    events.push({
        type: "assistant.message",
        agentId: "review-agent",
        data: { content: "Background result" },
    });

    const conversation = formatRecentConversation(events);

    assert.doesNotMatch(conversation, /User:\nQuestion 1(?:\n|$)/);
    assert.match(conversation, /User:\nQuestion 2/);
    assert.match(conversation, /Assistant:\nAnswer 11/);
    assert.match(conversation, /Tool call: view \(tool-success\)/);
    assert.match(conversation, /"path": "README.md"/);
    assert.match(conversation, /"detailedContent": "Complete README contents"/);
    assert.match(conversation, /Tool result: tool-failure \(failure\)/);
    assert.match(conversation, /"message": "Command was not found"/);
    assert.doesNotMatch(conversation, /Background result/);
});

test("formats a requested number of foreground turns", () => {
    const events = [];
    for (let index = 1; index <= 4; index += 1) {
        events.push({
            type: "user.message",
            data: { content: `Question ${index}` },
        });
        events.push({
            type: "assistant.message",
            data: { content: `Answer ${index}` },
        });
    }

    const conversation = formatRecentConversation(events, 2);

    assert.doesNotMatch(conversation, /Question 2/);
    assert.match(conversation, /Question 3/);
    assert.match(conversation, /Answer 4/);
});

test("builds concise memory and skill review guidance", () => {
    const prompt = buildCurationReviewPrompt(
        "C:\\persistent-skills",
        "User:\nPrefer concise answers.",
    );

    assert.match(prompt, /recent foreground conversation/);
    assert.match(prompt, /complete tool inputs and outputs/);
    assert.match(prompt, /compact, durable facts/);
    assert.match(prompt, /new class-level skill/);
    assert.match(prompt, /C:\\persistent-skills/);
    assert.match(prompt, /make no persistence changes/);
    assert.match(prompt, /Prefer concise answers/);
});

test("builds a full-session review prompt without an embedded transcript", () => {
    const prompt = buildFullSessionCurationReviewPrompt(
        "C:\\persistent-skills",
        "session-123",
    );

    assert.match(prompt, /session ID: session-123/);
    assert.match(prompt, /session history tools/);
    assert.match(prompt, /entire foreground conversation/);
    assert.doesNotMatch(prompt, /<recentConversation>/);
    assert.doesNotMatch(prompt, /transcript includes/);
});

test("omits memory guidance when extension memory is disabled", () => {
    const prompt = buildCurationReviewPrompt(
        "C:\\persistent-skills",
        "User:\nPrefer concise answers.",
        false,
    );

    assert.doesNotMatch(prompt, /Memory:/);
    assert.doesNotMatch(prompt, /compact, durable facts/);
    assert.match(prompt, /Skills:/);
    assert.match(prompt, /C:\\persistent-skills/);
});

test("extracts file changes from review tool calls", () => {
    assert.deepEqual(
        getFileChanges(
            "memory_update",
            { store: "user" },
            { memory: "MEMORY.md", user: "USER.md" },
        ),
        [{ operation: "modified", path: "USER.md" }],
    );
    assert.deepEqual(
        getFileChanges(
            "apply_patch",
            {
                patch: [
                    "*** Begin Patch",
                    "*** Add File: skills/new/SKILL.md",
                    "+content",
                    "*** Update File: skills/existing/SKILL.md",
                    "@@",
                    "-old",
                    "+new",
                    "*** Delete File: skills/old/SKILL.md",
                    "*** End Patch",
                ].join("\n"),
            },
            {},
        ),
        [
            { operation: "added", path: "skills/new/SKILL.md" },
            { operation: "modified", path: "skills/existing/SKILL.md" },
            { operation: "deleted", path: "skills/old/SKILL.md" },
        ],
    );
});
