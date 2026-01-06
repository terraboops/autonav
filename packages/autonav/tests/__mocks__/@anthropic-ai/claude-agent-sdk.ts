/**
 * Mock for @anthropic-ai/claude-agent-sdk
 *
 * This mock allows tests to simulate Claude Agent SDK responses
 * without making actual API calls.
 */

import { vi } from 'vitest';

export const query = vi.fn();

/**
 * Helper to set mock agent response with simple text
 */
export function mockAgentResponse(text: string) {
  query.mockImplementation(() => ({
    [Symbol.asyncIterator]: async function* () {
      yield {
        type: 'assistant',
        message: { content: [{ type: 'text', text }] },
      };
      yield { type: 'result', subtype: 'success' };
    },
  }));
}

/**
 * Helper to set mock agent response with JSON config
 */
export function mockAgentConfig(config: any) {
  const jsonBlock = '```json\n' + JSON.stringify(config) + '\n```';
  mockAgentResponse(jsonBlock);
}

/**
 * Helper to mock a conversation with multiple exchanges
 */
export function mockConversation(exchanges: Array<{ user: string; assistant: string }>) {
  let exchangeIndex = 0;

  query.mockImplementation(() => ({
    [Symbol.asyncIterator]: async function* () {
      if (exchangeIndex < exchanges.length) {
        yield {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: exchanges[exchangeIndex].assistant }],
          },
        };
        exchangeIndex++;
      }
      yield { type: 'result', subtype: 'success' };
    },
  }));
}

/**
 * Helper to mock an error response
 */
export function mockAgentError(error: Error) {
  query.mockImplementation(() => ({
    [Symbol.asyncIterator]: async function* () {
      throw error;
    },
  }));
}

/**
 * Reset all mocks
 */
export function resetMocks() {
  query.mockReset();
}
