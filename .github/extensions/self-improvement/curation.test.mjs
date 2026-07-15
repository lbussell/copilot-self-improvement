import assert from "node:assert/strict";
import test from "node:test";
import {
    buildCurationReviewPrompt,
    createPeriodicCurationReview,
    formatRecentConversation,
} from "./curation.mjs";

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
    assert.doesNotMatch(conversation, /Background result/);
});

test("builds concise memory and skill review guidance", () => {
    const prompt = buildCurationReviewPrompt(
        "C:\\persistent-skills",
        "User:\nPrefer concise answers.",
    );

    assert.match(prompt, /recent foreground conversation/);
    assert.match(prompt, /compact, durable facts/);
    assert.match(prompt, /class-level umbrella skill/);
    assert.match(prompt, /C:\\persistent-skills/);
    assert.match(prompt, /make no persistence changes/);
    assert.match(prompt, /Prefer concise answers/);
});
