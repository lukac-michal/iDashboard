---
name: skill-creator
description: Guide for creating effective skills. Use when users want to create a new skill (or update an existing skill) that extends Claude's capabilities with specialized knowledge, workflows, or tool integrations.
---

# Skill Creator

Guide for creating effective skills for iDashboard's Claude Code setup.

## Skill Structure

```
skill-name/
├── SKILL.md          # Required - instructions and metadata
├── scripts/          # Optional - executable code
├── references/       # Optional - docs loaded on demand
└── assets/           # Optional - templates, icons, etc.
```

## SKILL.md Format

```markdown
---
name: skill-name
description: What the skill does and when to trigger it. Be specific about triggers.
argument-hint: "[optional args]"
allowed-tools: Bash, Read, Grep  # Optional tool restrictions
---

# Skill Title

Instructions for using the skill.
$ARGUMENTS contains user-provided arguments.
```

## Creation Process

1. **Understand** — What should the skill do? Get concrete examples.
2. **Plan** — Identify scripts, references, assets needed.
3. **Create** — Write SKILL.md with proper frontmatter. Create subdirectories if needed.
4. **Test** — Run the skill on real tasks.
5. **Register** — Add to `/help` skill if user-invocable.
6. **Iterate** — Refine based on usage.

## Key Principles

- **Concise** — Context window is shared. Only include what Claude doesn't already know.
- **Progressive disclosure** — Metadata always loaded (~100 words). Body loaded on trigger. References loaded on demand.
- **Appropriate freedom** — Strict steps for fragile operations, flexible guidance for creative tasks.
- **Complete code** — Include actual code in examples, not pseudocode.
- **SKILL.md under 500 lines** — Split into references/ if longer.

## Where to Place

- Project skills: `.claude/skills/{name}/SKILL.md`
- Location: `/Users/michal.lukac/dev/iDashboard/.claude/skills/`
