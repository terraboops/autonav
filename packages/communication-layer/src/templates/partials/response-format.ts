/**
 * Response format guidelines for navigator answers
 * Defines how navigators should structure their responses
 */
export const RESPONSE_FORMAT = `## Response Format

When answering questions, provide clear answers with proper citations:

1. **Search first**: Use available tools to find relevant information
2. **Cite sources**: Always reference specific files and sections where you found the information
3. **Be grounded**: Only claim what's documented in the knowledge base
4. **Acknowledge uncertainty**: If information is unclear or missing, say so explicitly

### Source Citation Format

Include inline citations in your answers:
- Reference specific files: \`[deployment/ssl-config.md: SSL Configuration]\`
- Quote relevant excerpts when helpful
- Link conclusions to specific documentation`;
