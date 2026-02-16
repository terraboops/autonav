/**
 * Prompts for Standup Mode
 *
 * System prompts and user prompts for the report and sync phases.
 * Uses shared Agent Identity Protocol from communication-layer.
 *
 * Prompt engineering principles applied:
 * - XML tags separate data from instructions (Anthropic best practice)
 * - System prompts define role/constraints; user prompts define task/data (no duplication)
 * - Guided chain-of-thought before tool submission
 * - Explicit context: what output is used for, who reads it, where it fits in workflow
 * - Minimize noise: no redundant instructions between system and user prompts
 */

import {
  buildAgentIdentityProtocol,
  type NavigatorIdentity,
} from "@autonav/communication-layer";
import type { StatusReport, SyncResponse } from "./types.js";

// Re-export for convenience
export type { NavigatorIdentity };

/**
 * Context passed to report phase prompts
 */
interface ReportPromptContext {
  navDirectory: string;
  knowledgeBasePath: string;
  otherNavigators: string[];
}

/**
 * Context passed to sync phase prompts
 */
interface SyncPromptContext {
  navDirectory: string;
  knowledgeBasePath: string;
  standupDir: string;
  allReports: StatusReport[];
  previousSyncResponses: SyncResponse[];
  otherNavigators: string[];
}

/**
 * Build the system prompt for a navigator in the report phase.
 *
 * Role definition + behavioral constraints only.
 * Task-specific instructions live in the user prompt to avoid duplication.
 */
export function buildReportSystemPrompt(navSystemPrompt: string): string {
  return `${navSystemPrompt}

<standup_role>
You are participating in Phase 1 (Report) of a multi-navigator standup. Your output will be read by other navigators in Phase 2 (Sync) to identify cross-navigator dependencies and resolve blockers.

Your sole deliverable is a structured status report submitted via the \`submit_status_report\` tool. Do not produce any other output.

<constraints>
- You have READ-ONLY access. Do not attempt to write, edit, or create files.
- Base every claim on evidence from your knowledge base or working directories. If you have no evidence of recent progress, say so rather than fabricating items.
- A blocker is something that prevents YOU from making progress. Do not report general risks or hypotheticals as blockers.
- For each blocker, if you know which specific navigator could help, set \`needsFrom\` to their exact name. Otherwise set it to "any".
- \`severity\` meanings: "critical" = completely blocked, cannot proceed; "moderate" = slowed but can work around; "minor" = inconvenience, low priority.
- \`canHelpWith\` should describe concrete capabilities, not vague offers. Bad: "general advice". Good: "Kubernetes ingress configuration for multi-tenant setups".
</constraints>
</standup_role>`;
}

/**
 * Build the user prompt for the report phase.
 *
 * Provides task context, data via XML tags, and guided chain-of-thought.
 */
export function buildReportPrompt(
  context: ReportPromptContext,
  identity: NavigatorIdentity | null
): string {
  const identityProtocol = buildAgentIdentityProtocol(identity, {
    name: "Autonav Standup",
    request:
      "Provide your status report for this multi-navigator standup using the `submit_status_report` tool.",
  });

  const otherNavsList =
    context.otherNavigators.length > 0
      ? context.otherNavigators.map((n) => `  - ${n}`).join("\n")
      : "  (none)";

  return `${identityProtocol}
<task_context>
This is a multi-navigator standup. After all navigators submit their reports in parallel, each navigator will review ALL reports and attempt to resolve each other's blockers. Your report directly determines whether other navigators can help you, so specificity matters.
</task_context>

<your_environment>
<directory>${context.navDirectory}</directory>
<knowledge_base>${context.knowledgeBasePath}</knowledge_base>
<other_navigators>
${otherNavsList}
</other_navigators>
</your_environment>

<instructions>
Think step-by-step before submitting your report:

1. Read your CLAUDE.md file to understand your current role, domain, and responsibilities.
2. Scan your knowledge base directory to identify recent work, changes, or documented progress.
3. If you have working directories configured, scan those for additional context about your current state.
4. Think through the following in order:
   a. What is your primary focus area right now? Be specific — name the feature, system, or problem.
   b. What concrete progress have you made? List only things you can point to evidence for.
   c. What is actually blocking you? Only report real blockers, not hypothetical risks. For each one, assess severity and whether a specific other navigator could help.
   d. Given the other navigators in this standup, what concrete expertise or knowledge could you offer them?
   e. Are there areas where you lack knowledge that another navigator might cover?
5. Submit your report using the \`submit_status_report\` tool with your findings.
</instructions>`;
}

/**
 * Build the system prompt for a navigator in the sync phase.
 *
 * Role definition + behavioral constraints only.
 */
export function buildSyncSystemPrompt(navSystemPrompt: string): string {
  return `${navSystemPrompt}

<standup_role>
You are participating in Phase 2 (Sync) of a multi-navigator standup. You have received status reports from all navigators and must help resolve their blockers using your domain expertise.

Your sole deliverable is a structured sync response submitted via the \`submit_sync_response\` tool.

<constraints>
- You MAY read and modify files in your own directory.
- You MAY write shared artifacts (docs, configs, scripts) to the standup directory.
- You MUST NOT modify files in other navigators' directories.
- Prioritize blockers by severity: resolve "critical" blockers first, then "moderate", then "minor".
- For each resolution, honestly assess your confidence: "high" = you are certain this resolves the blocker; "medium" = likely helpful but the navigator should verify; "low" = best-effort suggestion, may not fully resolve it.
- If you create an artifact file to help resolve a blocker, write it to the standup directory and reference its path in \`artifactPath\`.
- Set \`followUpNeeded\` to true only if there are unresolved critical blockers or if your resolution requires the other navigator to take action and confirm.
</constraints>
</standup_role>`;
}

/**
 * Build the user prompt for the sync phase.
 *
 * Data sections use XML tags for clean separation.
 * Includes guided chain-of-thought for blocker prioritization.
 */
export function buildSyncPrompt(
  context: SyncPromptContext,
  identity: NavigatorIdentity | null
): string {
  const identityProtocol = buildAgentIdentityProtocol(identity, {
    name: "Autonav Standup",
    request:
      "Review all status reports and help resolve blockers using the `submit_sync_response` tool.",
  });

  const reportsXml = context.allReports
    .map((r) => formatReportAsXml(r))
    .join("\n\n");

  const previousSyncXml =
    context.previousSyncResponses.length > 0
      ? `<previous_sync_responses>
${context.previousSyncResponses.map((s) => formatSyncAsXml(s)).join("\n\n")}
</previous_sync_responses>`
      : "";

  return `${identityProtocol}
<task_context>
This is the sync phase of a multi-navigator standup. Each navigator takes a turn reviewing all status reports and attempting to resolve blockers from their domain expertise. You are seeing all reports plus any sync responses from navigators who went before you. Your goal is to unblock other navigators wherever your knowledge applies.
</task_context>

<your_environment>
<directory>${context.navDirectory}</directory>
<standup_output_directory>${context.standupDir}</standup_output_directory>
</your_environment>

<status_reports>
${reportsXml}
</status_reports>

${previousSyncXml}

<instructions>
Think step-by-step before submitting your sync response:

1. Read through every status report above. For each blocker, note:
   - Does \`needsFrom\` match your name ("${identity?.name || "your name"}")? These are your primary responsibility.
   - Is \`needsFrom\` set to "any"? You should attempt these if they fall in your domain.
   - What is the severity? Prioritize critical > moderate > minor.

2. For each blocker you can address:
   a. Read relevant files from your knowledge base or working directories to find the answer.
   b. Determine whether you can fully resolve it, partially help, or only offer a lead.
   c. If the resolution would benefit from a written artifact (e.g., a config snippet, a runbook, a script), write it to the standup output directory and note the path.
   d. Assess your confidence honestly.

3. Review whether previous sync responses (if any) already addressed some blockers. Do not duplicate work — build on or refine previous resolutions instead.

4. Note any new cross-cutting insights you discovered while reviewing all the reports together (e.g., two navigators working on conflicting approaches, shared dependencies, opportunities for collaboration).

5. Submit your sync response using the \`submit_sync_response\` tool.
</instructions>`;
}

/**
 * Format a status report as XML for the sync phase context.
 * XML tags provide clean boundaries between data sections.
 */
function formatReportAsXml(report: StatusReport): string {
  const blockersList =
    report.blockers.length > 0
      ? report.blockers
          .map(
            (b) =>
              `    <blocker severity="${b.severity}"${b.needsFrom ? ` needs_from="${b.needsFrom}"` : ""}>${b.description}</blocker>`
          )
          .join("\n")
      : "    <none/>";

  const canHelpList =
    report.canHelpWith.length > 0
      ? report.canHelpWith.map((h) => `    <capability>${h}</capability>`).join("\n")
      : "    <none/>";

  const gapsList =
    report.knowledgeGaps && report.knowledgeGaps.length > 0
      ? `\n  <knowledge_gaps>\n${report.knowledgeGaps.map((g) => `    <gap>${g}</gap>`).join("\n")}\n  </knowledge_gaps>`
      : "";

  return `<report navigator="${report.navigatorName}">
  <current_focus>${report.currentFocus}</current_focus>
  <recent_progress>
${report.recentProgress.map((p) => `    <item>${p}</item>`).join("\n")}
  </recent_progress>
  <blockers>
${blockersList}
  </blockers>
  <can_help_with>
${canHelpList}
  </can_help_with>${gapsList}
</report>`;
}

/**
 * Format a sync response as XML for accumulating context
 */
function formatSyncAsXml(sync: SyncResponse): string {
  const resolutions =
    sync.blockerResolutions.length > 0
      ? sync.blockerResolutions
          .map(
            (r) =>
              `    <resolution for="${r.navigatorName}" confidence="${r.confidence}"${r.artifactPath ? ` artifact="${r.artifactPath}"` : ""}>
      <blocker>${r.blockerDescription}</blocker>
      <answer>${r.resolution}</answer>
    </resolution>`
          )
          .join("\n")
      : "    <none/>";

  const insights =
    sync.newInsights && sync.newInsights.length > 0
      ? `\n  <insights>\n${sync.newInsights.map((i) => `    <insight>${i}</insight>`).join("\n")}\n  </insights>`
      : "";

  return `<sync_response navigator="${sync.navigatorName}" follow_up_needed="${sync.followUpNeeded}">
  <summary>${sync.summary}</summary>
  <blocker_resolutions>
${resolutions}
  </blocker_resolutions>${insights}
</sync_response>`;
}
