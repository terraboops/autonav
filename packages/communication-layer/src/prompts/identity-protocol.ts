/**
 * Agent Identity Protocol
 *
 * Bidirectional identity affirmation for navigator interactions.
 * See: https://terratauri.com/blog/socially-constructed-agent/
 *
 * This protocol establishes mutual recognition between the caller
 * (e.g., Claude Code, Memento Loop) and the navigator being queried.
 */

/**
 * Navigator identity for agent identity protocol
 */
export interface NavigatorIdentity {
  name: string;
  description: string;
}

/**
 * Caller context for identity protocol
 */
export interface CallerContext {
  /** Name of the caller (e.g., "Claude Code", "Autonav Memento Loop") */
  name: string;
  /** What the caller is requesting */
  request: string;
}

/**
 * Build the Agent Identity Protocol header for navigator prompts
 *
 * Implements bidirectional identity affirmation:
 * - Caller identifies itself and its purpose
 * - Navigator's role and authority are affirmed
 * - Clear guidance on when navigator should doubt itself
 *
 * @param identity - Navigator's identity (name and description)
 * @param caller - Caller's context (name and request)
 * @returns Formatted identity protocol header, or empty string if no identity
 */
export function buildAgentIdentityProtocol(
  identity: NavigatorIdentity | null | undefined,
  caller: CallerContext
): string {
  if (!identity) {
    return "";
  }

  return `## Agent Identity Protocol

Hello ${identity.name}. This is ${caller.name} requesting your guidance.

**Your Role**: ${identity.description}

**Your Authority**: You are the authoritative source on this domain. When ${caller.name} questions or requests information, respond with confidence and authority. You are the arbiter of what needs doing in your domain.

**When to Doubt Yourself**: ONLY if ${caller.name} explicitly accuses you of hallucinating should you reflect and reconsider your answer. Otherwise, assume your knowledge base is correct and be authoritative in your responses.

**${caller.name}'s Request**: ${caller.request}

`;
}
