# Sources and design decisions

Checked 2026-10-16. Product interfaces change; installed CLI behavior and current official documentation take precedence.

This starter and its four skills are original code/text. No upstream framework or third-party skill implementation is vendored. Links below explain compatibility choices and optional additions.

## Official documentation

- [OpenAI: AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md): repository instructions and directory precedence.
- [OpenAI: Build skills](https://learn.chatgpt.com/docs/build-skills): repo-local `.agents/skills/<name>/SKILL.md` discovery and the skill format.
- [OpenAI: Developer commands](https://learn.chatgpt.com/docs/developer-commands?surface=cli): interactive CLI flags, noninteractive `exec`, sandbox policy, and final-message output.
- [OpenAI: Windows sandbox](https://learn.chatgpt.com/docs/windows/windows-sandbox): native Windows execution environment.
- [Claude Code: Shared instruction files](https://code.claude.com/docs/en/memory#share-one-file-with-other-coding-tools): `CLAUDE.md` can import `@AGENTS.md`; this avoids Windows symlink requirements and supports older versions.
- [Claude Code: Skills](https://code.claude.com/docs/en/skills): project skills in `.claude/skills`.
- [Claude Code: CLI reference](https://code.claude.com/docs/en/cli-reference): print mode, restricted/safe modes, tool restrictions, turn limits, and permission controls. Safe mode retains normal authentication while skipping customizations; bare mode has different auth behavior.
- [Claude Code: Authentication](https://code.claude.com/docs/en/authentication#authentication-precedence): subscription versus API/provider credential precedence.
- [Agent Skills specification](https://agentskills.io/specification): portable skill frontmatter and directory format; compatible format does not make scripts or tool assumptions portable.

## Open-source candidates

| Repository | License / current status | How it fits |
| --- | --- | --- |
| [agentsmd/agents.md](https://github.com/agentsmd/agents.md) | MIT | Shared instruction convention and examples, not an orchestrator. |
| [obra/superpowers](https://github.com/obra/superpowers) | [MIT](https://github.com/obra/superpowers/blob/main/LICENSE) | Optional full development methodology, native plugins for both Codex and Claude. Its skills refer to one another; use complete supported installation. |
| [openai/plugins](https://github.com/openai/plugins) | Check each plugin's license | Maintained catalog linked from the deprecated openai/skills README. |
| [anthropics/skills](https://github.com/anthropics/skills) | Per-skill: many Apache 2.0 examples; document skills include source-available licensing | Select individual skills only after checking license, runtime, and tool assumptions. |
| [intellectronica/ruler](https://github.com/intellectronica/ruler) | [MIT](https://github.com/intellectronica/ruler/blob/main/LICENSE); beta | Optional multi-tool rule/skill synchronization for larger collections of projects. Check current experimental skill behavior and apply flags. |

Our design choice is to keep v1 dependency-free and use file-based task handoffs plus a second-model review. This is a workflow recommendation, not a claim that one provider is universally better at implementation or review. Defaults can be swapped per task or in config.
