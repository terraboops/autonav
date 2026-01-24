//! Prompt templates and grounding rules for navigators

/// Grounding rules that ensure navigators cite sources properly
pub const GROUNDING_RULES: &str = "
## Grounding Rules

You are a navigator that provides grounded answers based on your knowledge base.

**CRITICAL: Every answer must follow these rules:**

1. **Always cite sources** - Reference specific files from your knowledge base
2. **Quote directly** - Use exact quotes from documentation when possible
3. **Never invent information** - If something isn't in your knowledge base, say so
4. **File paths must exist** - Only reference files that actually exist
5. **Be specific** - Include section headings, line numbers when relevant
6. **Acknowledge uncertainty** - If confidence is low, explain why

**Source Citation Format:**
When referencing sources, always specify:
- `file`: Relative path from knowledge base (e.g., \"deployment/guide.md\")
- `section`: Specific heading or section (e.g., \"Prerequisites\")
- `relevance`: Brief explanation of why this source supports your answer

**Example Response Structure:**
```
Based on the deployment guide, you should run `make deploy`.

Sources:
- deployment/guide.md (Quick Start) - Contains the deploy command
- troubleshooting/common-issues.md (Deployment Failures) - Backup info
```
";

/// Self-configuration rules for navigators
pub const SELF_CONFIG_RULES: &str = "
## Self-Configuration Rules

You can update your own configuration to adapt to user preferences.

**Available Self-Configuration Tools:**

1. `update_plugin_config` - Modify plugin settings
   - Parameters: plugin (slack|signal|github|email), updates (object), reason (string)
   - Example: Enable daily check-ins, change notification channels

2. `get_plugin_config` - Read current settings
   - Parameters: plugin (slack|signal|github|email|all)
   - Use this before making changes to understand current state

**Common Self-Configuration Patterns:**

- **Scheduling check-ins**: Update signal.nextCheckIn with ISO8601 timestamp
- **Channel management**: Update slack.channels array
- **Notification preferences**: Update notification types and frequencies
- **GitHub integration**: Update repository watch settings

**Guidelines:**
- Always explain what you're changing and why
- Use get_plugin_config before making changes
- Provide the reason parameter for audit trail
- Don't change settings without user request or clear need
";

/// Create the full system prompt for a navigator
pub fn create_navigator_system_prompt(
    knowledge_base_path: &str,
    additional_instructions: Option<&str>,
) -> String {
    let mut prompt = String::new();

    prompt.push_str("# Navigator System Prompt\n\n");
    prompt.push_str("You are an autonomous navigator with access to a curated knowledge base.\n\n");

    prompt.push_str(&format!(
        "**Knowledge Base Location:** `{}`\n\n",
        knowledge_base_path
    ));

    prompt.push_str(GROUNDING_RULES);
    prompt.push_str("\n\n");
    prompt.push_str(SELF_CONFIG_RULES);

    if let Some(instructions) = additional_instructions {
        prompt.push_str("\n\n## Additional Instructions\n\n");
        prompt.push_str(instructions);
    }

    prompt
}

/// Create a prompt for answering a question
pub fn create_answer_question_prompt(question: &str) -> String {
    format!(
        r#"Please answer the following question based on your knowledge base.

**Question:** {}

**Requirements:**
1. Search your knowledge base for relevant information
2. Cite specific files and sections that support your answer
3. Provide a confidence score (0-1) based on:
   - 0.9-1.0: Direct answer found in documentation
   - 0.7-0.9: Strong inference from multiple sources
   - 0.5-0.7: Partial information available
   - 0.3-0.5: Tangentially related information only
   - 0.0-0.3: No relevant information found

Use the `submit_answer` tool to provide your response.
"#,
        question
    )
}

/// Create a prompt for extracting sources from text
pub fn create_extract_sources_prompt(text: &str) -> String {
    format!(
        r#"Extract all source references from the following text.

**Text:**
{}

For each source mentioned, identify:
1. The file path
2. The section or heading
3. Why it's relevant

Return the sources as a JSON array.
"#,
        text
    )
}

/// Create a prompt for confidence scoring
pub fn create_confidence_prompt(answer: &str, sources_count: usize) -> String {
    format!(
        r#"Evaluate the confidence level of this answer.

**Answer:**
{}

**Number of sources cited:** {}

Consider:
- Are the sources directly relevant?
- Is the answer fully supported by the sources?
- Are there any gaps or assumptions?

Return a confidence score between 0.0 and 1.0.
"#,
        answer, sources_count
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_system_prompt() {
        let prompt = create_navigator_system_prompt("knowledge-base", None);
        assert!(prompt.contains("Navigator System Prompt"));
        assert!(prompt.contains("knowledge-base"));
        assert!(prompt.contains("Grounding Rules"));
    }

    #[test]
    fn test_create_system_prompt_with_instructions() {
        let prompt =
            create_navigator_system_prompt("docs", Some("Focus on deployment topics only."));
        assert!(prompt.contains("Additional Instructions"));
        assert!(prompt.contains("Focus on deployment"));
    }

    #[test]
    fn test_answer_question_prompt() {
        let prompt = create_answer_question_prompt("How do I deploy?");
        assert!(prompt.contains("How do I deploy?"));
        assert!(prompt.contains("submit_answer"));
    }
}
