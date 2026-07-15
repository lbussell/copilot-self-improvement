I’ll consolidate the runtime into four flows—foreground use, periodic review, persistence, and weekly curation—and tie each prompt to the exact agent and tool boundary.
## 1. Foreground agent: normal task execution

The main `AIAgent` handles the user’s task and can manage memory or skills directly.

### Prompt content

At session creation, its cached system prompt includes:

- `MEMORY_GUIDANCE` when the `memory` tool is available:
  - Exact text: `copilot-self-improvement\memory-guidance.md`
- `SKILLS_GUIDANCE` when `skill_manage` is available:
  - Exact text: `copilot-self-improvement\skills-guidance.md`
- A dynamically generated mandatory skill index:
  - Lists available skill names and descriptions.
  - Instructs the model to call `skill_view` whenever a skill is even partially relevant.
  - Source: `agent\prompt_builder.py:1445-1697`
- Frozen `MEMORY.md` and `USER.md` contents:
  - Includes the `§` entry separators.
  - Includes usage headers and character limits.
  - Loaded once per session and not updated mid-session.

The following are sent as **tool definitions**, rather than ordinary messages:

- Memory tool description: `memory-tool.md`
- Skill management description: `skill-management-tool.md`
- `skills_list` and `skill_view` descriptions from `tools\skills_tool.py`

### Tool access

The normal agent receives the configured platform toolset. Memory and skills are part of Hermes’s core tool list by default.

Relevant tools:

| Tool | Operations |
|---|---|
| `memory` | Add, replace, or remove entries in `MEMORY.md` or `USER.md` |
| `skills_list` | List skill names and descriptions |
| `skill_view` | Load `SKILL.md` or a supporting file |
| `skill_manage` | Create, patch, edit, archive/delete, or add/remove supporting files |
| Provider-specific memory tools | Optional; supplied by the configured external memory provider |

The foreground agent also retains its normal terminal, file, browser, delegation, and other tools.

## 2. Built-in memory lifecycle

### Session startup

1. Hermes reads:
   - `~/.hermes/memories/MEMORY.md`
   - `~/.hermes/memories/USER.md`
2. Entries are split on `\n§\n`.
3. Exact duplicates are removed from the in-memory representation.
4. Each entry is scanned for prompt-injection patterns.
5. A frozen system-prompt snapshot is rendered.
6. The snapshot remains unchanged for the session to preserve prompt caching.

Default limits:

- `MEMORY.md`: 2,200 characters
- `USER.md`: 1,375 characters

### During a normal turn

The main LLM can call `memory` at any time. The system and tool prompts tell it to save:

- User preferences and corrections
- Stable environment facts
- Conventions and tool quirks

They tell it not to save:

- Task progress
- Completed-work logs
- Temporary TODOs
- PR numbers, commit SHAs, and other quickly stale artifacts
- Reusable procedures, which belong in skills

A memory call resets the memory-review counter.

### Capacity management

Hermes never automatically selects old memories for deletion.

If a write exceeds the limit:

1. The write fails.
2. The tool returns current entries and usage.
3. The LLM selects redundant or stale entries.
4. It sends one atomic batch containing removals/replacements plus the addition.
5. Hermes validates the final state against the character limit.

After repeated failed consolidation attempts in one turn, Hermes stops asking the model to retry and leaves memory unchanged.

### Mid-session writes

Writes reach disk immediately, but they do not alter the current system prompt. The new memory appears:

- In the next session, or
- After context compression invalidates and rebuilds the system prompt

## 3. Periodic memory review

This is a backstop for memories the foreground model failed to save.

### Trigger

At the start of every user turn:

1. `_turns_since_memory` increments.
2. When it reaches `memory.nudge_interval`, default **10**:
   - `should_review_memory` becomes true.
   - The counter resets.
3. The trigger requires:
   - A real `MemoryStore`
   - The `memory` tool in the agent’s toolset
   - A positive interval

On session resume, Hermes reconstructs the counter from prior user-message count.

The review does not run immediately. At the end of the turn, Hermes requires:

- A final response
- No interruption
- The review flag still set

It then starts a daemon background thread after delivering the response.

### Prompt

Exact memory-only prompt:

- `copilot-self-improvement\memory-review.md`

The actual user message sent to the reviewer is:

```text
{memory-review.md}

You can only call memory and skill management tools. Other tools will be denied at runtime — do not attempt them.
```

The reviewer receives the completed conversation as history.

## 4. Periodic skill review

This looks for corrections, reusable techniques, and deficient skills.

### Trigger

Hermes counts **tool-calling iterations**, not user turns:

1. Every tool-loop iteration increments `_iters_since_skill`.
2. Calling `skill_manage` resets that counter.
3. At turn completion, if the counter has reached `skills.creation_nudge_interval`, default **10**:
   - Skill review is requested.
   - The counter resets.
4. `skill_manage` must be available.
5. The turn must finish successfully and without interruption.

### Prompt

Exact skill-only prompt:

- `copilot-self-improvement\skill-review.md`

Its preference order is:

1. Patch a skill loaded during the conversation.
2. Patch an existing umbrella skill.
3. Add a reference, template, or script to an umbrella.
4. Create a new class-level umbrella only when none exists.

It rejects one-session micro-skills and transient environment failures.

The actual user message also receives the runtime-restriction suffix:

```text
{skill-review.md}

You can only call memory and skill management tools. Other tools will be denied at runtime — do not attempt them.
```

### Combined trigger

If both memory and skill triggers fire on the same turn, Hermes sends one prompt instead of two:

- `copilot-self-improvement\combined-review.md`

## 5. The background review agent

Memory and skill reviews run in the same kind of isolated fork.

### Which model runs it?

By default:

- Same provider and model as the foreground agent
- Same credentials
- Same cached system prompt
- Same session ID
- Full conversation history
- Maximum 16 iterations

This allows reuse of the foreground model’s prompt cache.

If `auxiliary.background_review` selects a different provider or model:

- Hermes uses that model instead.
- It sends a condensed conversation digest rather than the full history.
- It does not reuse the parent’s cached system prompt.

### Which tools does it see?

For cache parity, its API request retains the parent’s tool-schema list. Therefore, the LLM may technically **see** terminal, browser, file, and other tool definitions.

### Which tools can it execute?

A runtime whitelist permits only:

- `memory`, when built-in memory or user profile is enabled
- `skills_list`
- `skill_view`
- `skill_manage`

All other calls are rejected at dispatch with:

```text
Background review denied non-whitelisted tool: {tool_name}.
Only memory/skill tools are allowed.
```

Dangerous-command approval is automatically denied, so the thread cannot block waiting for terminal input.

### Isolation

The fork has:

- No session database writes
- No context compression
- No recursive memory or skill nudges
- No external-memory-provider initialization
- No ability to finalize the parent session
- No normal status output

Built-in `MEMORY.md` and `USER.md` are rebound from the parent, so approved memory calls still modify the real files.

### Skill write restrictions

Runtime guards are stricter than portions of the written prompt:

- It cannot autonomously edit pinned skills.
- It cannot edit external-directory skills.
- It cannot edit hub-installed skills.
- It cannot edit bundled or protected built-in skills.
- It must call `skill_view` on the exact target before modifying it.
- A newly created skill is marked `created_by: agent`.

The prompt currently says pinned skills may be improved, but the code rejects autonomous edits to pinned skills. **The code wins.**

## 6. Skill discovery and use

### Discovery

At system-prompt construction, Hermes scans:

1. The active profile’s `~/.hermes/skills/`
2. Configured `skills.external_dirs`

It filters skills by:

- Platform compatibility
- Disabled-skill configuration
- Required tools and toolsets
- Current coding posture

Local skills override external skills with the same name.

### Loading

The system prompt only contains names and descriptions. Full instructions enter the conversation when:

- The model calls `skill_view`
- A skill slash command injects the skill
- The session starts with an explicitly preloaded skill

`skill_view` increments both:

- `view_count`
- `use_count`

Slash-command and preloaded skill content is injected as a user message rather than rebuilding the system prompt.

### Updating

`skill_manage` supports:

- `create`
- `patch`
- `edit`
- `delete`
- `write_file`
- `remove_file`

Successful modifications clear the cached skill-index snapshot, but the current conversation’s cached system prompt remains stable. The updated index appears in a future session or prompt rebuild.

Foreground-created skills are treated as user-owned. Only skills created by the autonomous background-review origin are marked agent-created for automatic curation.

## 7. Skill usage tracking

Hermes stores usage metadata in:

```text
~/.hermes/skills/.usage.json
```

Relevant fields include:

- `use_count`
- `view_count`
- `patch_count`
- `created_at`
- `last_activity_at`
- `state`: active, stale, or archived
- `pinned`
- agent-created provenance

This metadata drives the deterministic curator. Memory has no corresponding usage or timestamp metadata.

## 8. Deterministic skill curator

This process uses no LLM.

### Automatic polling

The curator is checked:

- At interactive CLI startup
- Hourly by the long-running gateway housekeeping loop

Both automatic call sites currently pass `idle_for_seconds=infinity`, so the configured two-hour idle requirement is automatically satisfied there.

The internal gates are:

- `curator.enabled`, default true
- Not paused
- At least `interval_hours`, default seven days, since the last run

On the first-ever observation, Hermes records the current time and defers the first real run by one full interval.

### Automatic transitions

On a due run:

1. Hermes creates a backup.
2. It examines curator-eligible skills.
3. Active skills unused for 30 days become stale.
4. Skills unused for 90 days are archived.
5. Stale skills used recently become active again.

It skips:

- Pinned skills
- Skills referenced by any cron job
- Hub-installed skills
- External-directory skills
- Protected built-ins

Bundled built-ins are eligible by default because `curator.prune_builtins` defaults to true. Their inactivity clock starts when first observed, preventing immediate mass archival.

Archiving moves the skill under `.archive`; it does not delete it.

## 9. LLM skill curator

Umbrella consolidation is separate from deterministic aging.

### Trigger

It runs only when:

- A curator run is due or explicitly requested, and
- `curator.consolidate: true`, or
- The user runs `hermes curator run --consolidate`

It is **off by default**.

### Prompt composition

Live run:

```text
{curator-review.md}
{optional prune-builtins override}

{dynamically rendered candidate list}
```

Dry run:

```text
{curator-dry-run.md}

{curator-review.md}
{optional prune-builtins override}

{dynamically rendered candidate list}
```

Exact fixed prompt bodies:

- `copilot-self-improvement\curator-review.md`
- `copilot-self-improvement\curator-dry-run.md`

### Which model runs it?

A fresh `AIAgent` uses:

- `auxiliary.curator` provider/model when configured
- Otherwise the active configured runtime
- Maximum 9,999 iterations
- No context files
- No built-in or external memory
- No recursive nudges
- No conversation history

### Tool access

The curator prompt tells the LLM its toolset is:

- `skills_list`
- `skill_view`
- `skill_manage`
- `terminal`

Unlike the periodic background reviewer, the curator does **not** install a runtime tool whitelist. Because it creates an agent without an explicit enabled-toolset list, it may receive the broader default Hermes tool schemas. Its effective restriction is therefore prompt guidance plus skill-write guards, not a hard four-tool dispatch boundary.

### Mutation safeguards

The curator’s writes carry the `background_review` origin, activating autonomous-write guards:

- Pinned, external, hub-installed, bundled, and protected skills cannot be modified through `skill_manage`.
- Existing content must be read before modification.
- LLM-requested deletion becomes recoverable archival.
- Deletion is accepted only when `absorbed_into=<existing umbrella>` proves consolidation.

The copied curator prompt says `absorbed_into=""` may represent pruning. Current code rejects that operation: only the deterministic inactivity pass may prune without an umbrella. Again, **the runtime guard wins over the prompt**.

## 10. Approval gates

Both are disabled by default.

### `memory.write_approval: true`

- Foreground CLI writes can request inline approval.
- Background writes are staged.
- Commands: `/memory pending`, `/memory approve`, `/memory reject`

### `skills.write_approval: true`

All writes are staged because skill diffs are too large for inline approval.

Commands:

- `/skills pending`
- `/skills diff`
- `/skills approve`
- `/skills reject`

## 11. External memory providers

An optional provider runs alongside built-in files. Only one external provider may be active.

### Before each turn

1. Provider receives `on_turn_start`.
2. Hermes calls `prefetch(query)`.
3. Recalled content is fenced as `<memory-context>`.
4. It is appended to the current API-call user message only.
5. It is not persisted into the transcript or system prompt.

### After each completed turn

Hermes asynchronously:

- Calls `sync_turn(user, assistant)`
- Queues prefetch warming for the next turn

Interrupted turns are not synchronized.

Provider work runs through a serialized single-worker daemon executor, so a slow provider cannot block the foreground response.

### Session boundaries

On session rotation, reset, expiry, or exit, providers receive session-end/switch hooks and flush pending extraction.

The periodic review fork explicitly disables external providers so its artificial review prompt and response cannot contaminate provider memory.

## Compact timeline

```text
Session starts
  → Load MEMORY.md and USER.md
  → Build frozen memory blocks
  → Scan skills and build mandatory skill index
  → Build and cache system prompt

Each user turn starts
  → Increment memory-review counter
  → External provider prefetch
  → Inject recalled provider context into this API call

Foreground LLM works
  → May call memory
  → May list/view/manage skills
  → Memory or skill writes reset their respective counters

Turn completes
  → Sync completed turn to external provider
  → Check accumulated skill-tool iterations
  → If memory and/or skill trigger is due, spawn isolated reviewer

Every curator interval
  → Backup skill library
  → Deterministically mark stale/archive/reactivate
  → Optionally run LLM umbrella consolidation

Session ends or rotates
  → Flush/finalize external memory provider
```
