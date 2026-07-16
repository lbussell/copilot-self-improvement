# Automatic Copilot Self-improvement

This is a GitHub Copilot CLI plugin that enables automatic persistent memory
and skill creation via periodic self-reflection.

## Install

Install directly from GitHub:

```powershell
copilot plugin install lbussell/copilot-self-improvement
```

Or, clone this repo and load the local working tree:

```powershell
copilot --plugin-dir /path/to/copilot-self-improvement
```

`--plugin-dir` starts a Copilot CLI session with the local plugin loaded without
installing or caching it. Verify the plugin is enabled with the `/env` command.

## Usage

Self-improvement happens automatically as you use Copilot with this extension enabled.
Copilot will automatically keep MEMORY.md, USER.md, and skills up-to-date.

Every few turns, a background agent analyzes your conversation and looks for
things that went wrong, corrections you made, preferences you expressed, etc.
and make updates to memory, skills, and instructions accordingly.

You can run `/reflect` to manually trigger the review process.

## Data and settings

By default, persistent data is stored under:

```text
~/.copilot/self-improvement/
    settings.json
    storage/
        skills/
        MEMORY.md
        USER.md
```

The storage directory is configurable in `settings.json`.

## Development

Plugins installed from GitHub are cached. Use `copilot plugin update
self-improvement` after pushing changes.

For local development outside this repository, start Copilot with `copilot
--plugin-dir /path/to/copilot-self-improvement`; each new session loads the
current working tree. When Copilot runs inside this repository, the plugin is
discovered automatically.
