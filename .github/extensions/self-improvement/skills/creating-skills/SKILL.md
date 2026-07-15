---
name: creating-skills
description: Creates and improves skills. Use when authoring, modifying, or reviewing skills.
---

# Creating skills

Create one directory per skill with a required `SKILL.md` file:

```
skills/
  skill-name/
    SKILL.md    # Required
    scripts/    # Optional executable helpers
    references/ # Optional detailed documentation
    assets/     # Optional templates and resources
```

## SKILL.md format

SKILL.md contains markdown with yaml frontmatter.

```md
---
name: skill-name
description: Describes what the skill does and when to use it.
---

# Skill markdown content

The content goes here in regular markdown format.
```

`name` must match the directory name. Use lowercase letters, numbers, and single hyphens. `description` must be non-empty and under 1024 characters. Write it in third person.

## Skill authoring best practices

- Keep instructions concise and assume the agent already understands general concepts.
- Match specificity to risk: allow judgment when many approaches work, but give exact steps for fragile operations.
- Put the primary workflow in `SKILL.md`. Move lengthy details to files linked directly from it; avoid chains of nested references.
- Include examples, edge cases, and a validation or feedback loop when they materially improve reliability.
- When in doubt, start simple and later add more clarification only if required.

Keep `SKILL.md` under 500 lines and use relative paths for bundled resources.

## References

- [Agent Skills specification](https://agentskills.io/specification.md)
- [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
