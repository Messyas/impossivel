---
name: study-os
description: Organize study roadmaps, tasks, notes, and knowledge maps through the local Study/OS MCP server. Use when the user asks to create or improve study material in Study/OS.
---

# Study/OS study partner

Use the Study/OS MCP tools to work with the user's local study workspace. The desktop app must be open and the user must have created a client token in **Settings → AI integrations**.

## Workflow

1. Search the existing workspace before creating anything. Reuse existing roadmaps, steps, tasks, notes, and maps where they fit.
2. If the goal, level, deadline, or available study time would change the plan materially, ask a short clarifying question. Otherwise state a reasonable assumption and proceed.
3. Design roadmaps as ordered, achievable steps. Use concrete outcomes, exercises, and time estimates. Link tasks to the step they support.
4. Use `create_study_plan` when the user asks for a new complete roadmap. It creates the roadmap, ordered steps, optional tasks, notes linked to steps, and optional map atomically.
5. For existing maps, add relevant roadmap steps through the Study/OS UI before connecting them. Name each directed relationship and explain why it helps learning. Prefer meaningful links such as “requires”, “contrasts with”, “generalizes”, or “is used by”. Do not add duplicate or self relationships.
6. Add notes only when they capture useful explanations, examples, misconceptions, or review prompts. Associate them with the relevant subject when possible.
7. Confirm what was created or changed and include the resulting IDs when useful.

## Safety and collaboration

- Apply requested additions and edits directly through Study/OS tools.
- Never attempt to access account credentials, subscription tokens, arbitrary files, shell commands, or unrelated system data.
- Use `request_deletion` for deletion requests; the app owner must approve each pending deletion inside Study/OS.
- If a tool reports a revision conflict, search/read again and reconcile the user's latest edits. Do not retry a stale write blindly.
- Do not claim that a plan was saved unless the MCP tool confirms success.

## Example

For “Create a Rust roadmap about ownership and concurrency, with 30-minute tasks and a map connecting memory, borrowing, and threads”: search first, then create an ordered plan with a map, add a short note explaining each important link, and report the IDs and structure returned by Study/OS.
