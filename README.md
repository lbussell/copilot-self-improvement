# Automatic Copilot Self-improvement

This is a GitHub Copilot CLI plugin that enables automatic persistent memory
and skill creation via periodic self-reflection.

## Install

Install directly from GitHub:

```powershell
copilot plugin install lbussell/copilot-self-improvement
```

Or, clone this repo and install from your local copy:

```powershell
copilot plugin install .
```

Start a new Copilot CLI session and verify the plugin is enabled with the `/env` command.

## Usage

Self-improvement happens automatically as you use Copilot with this extension enabled.
Copilot will automatically keep MEMORY.md, USER.md, and skills up-to-date.

Every few turns, a background agent analyzes your conversation and looks for
things that went wrong, corrections you made, preferences you expressed, etc.
and make updates to memory, skills, and instructions accordingly.

You can run `/self-review` to manually trigger the review process.

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

Plugin installs are cached.
If running from local checkout, re-run `copilot plugin install .` after making changes.
