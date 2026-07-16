# Automatic Copilot Self-improvement

This is a GitHub Copilot CLI plugin that enables automatic persistent memory
and skill creation via periodic self-reflection.

## Install

Add the marketplace, then install the plugin:

```powershell
copilot plugin marketplace add lbussell/copilot-self-improvement
copilot plugin install self-improvement@lbussell
```

Or, clone this repo and load the local working tree:

```powershell
copilot --plugin-dir /path/to/copilot-self-improvement
```

`--plugin-dir` starts a Copilot CLI session with the local plugin loaded without
installing or caching it. Verify the plugin is enabled with the `/env` command.

## Usage

When this extension is installed and enabled, Copilot will automatically keep
its memories and skills up-to-date.

Every few turns, a background agent analyzes your conversation and looks for
things that went wrong, corrections you made, preferences you expressed, etc.
and updates the extension-managed memory (when active) and skills accordingly.

You can run `/reflect` to manually trigger the review process.

### Memory

This extension contains its own memory feature which conflicts with Copilot's
built-in (preview/experimental) memory feature. When Copilot's built-in memory
is enabled, this extension disables its memory management features. I recommend
turning `/memory off` when using this extension.

The reason for this is because Copilot's built-in memory feature stores
memories on your account and on your GitHub repo, not in source contol. This
extension manages memories in local files on-disk. This makes it easier to
inspect, modify, track changes, and back up memories.

## Data and settings

Persistent data is stored under `~/.copilot/self-improvement`

```text
~/.copilot/self-improvement/
    settings.json
    storage/
        skills/
        MEMORY.md
        USER.md
```

The storage directory is configurable in `settings.json`. You can override
Copilot's settings/home directory with `$COPILOT_HOME`.

## Development

Plugins installed from GitHub are cached.
Use `copilot plugin update self-improvement` after pushing changes.

For local development outside this repository, start Copilot with `copilot
--plugin-dir /path/to/copilot-self-improvement`; each new session loads the
current working tree. When Copilot runs inside this repository, the plugin is
discovered automatically.
