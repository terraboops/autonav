import { z } from 'zod';
import { Plugin, PluginHealthStatus } from '../../types.js';
import { WebClient, LogLevel } from '@slack/web-api';
import { assertNoCredentialsInText } from '../../utils/security.js';

// Configuration schema
export const SlackConfigSchema = z.object({
  token: z.string().describe('Slack Bot Token (xoxb-...)'),
  channels: z.array(z.string()).default([]).describe('Channel IDs to monitor'),
  threadNotifications: z.boolean().default(true).describe('Reply in threads'),
  summaryFrequency: z.enum(['realtime', 'hourly', 'daily']).default('daily'),
  botUserId: z.string().optional().describe('Bot user ID (auto-populated)'),
});

export type SlackConfig = z.infer<typeof SlackConfigSchema>;

// Event schema
export const SlackEventSchema = z.object({
  type: z.enum(['message', 'mention', 'reaction']),
  channel: z.string(),
  user: z.string(),
  text: z.string().optional(),
  timestamp: z.string(),
  threadTs: z.string().optional(),
});

export type SlackEvent = z.infer<typeof SlackEventSchema>;

// Action schema with validation
export const SlackActionSchema = z.object({
  type: z.enum(['send-message', 'add-reaction', 'update-message']),
  channel: z.string().min(1).max(255),
  text: z.string().max(40000).optional(), // Slack's limit is 40,000 characters
  threadTs: z.string().optional().describe('Thread timestamp for replies'),
  reaction: z.string().max(100).optional().describe('Emoji for reactions'),
  messageTs: z.string().optional().describe('Message timestamp for updates'),
});

export type SlackAction = z.infer<typeof SlackActionSchema>;

/**
 * Slack Integration Plugin
 *
 * Enables navigators to send and receive Slack messages.
 * Supports channels, threads, mentions, and reactions.
 */
export class SlackPlugin implements Plugin<SlackConfig, SlackEvent, SlackAction> {
  readonly name = 'slack';
  readonly version = '1.0.0';
  readonly description = 'Send and receive Slack messages';
  readonly configSchema = SlackConfigSchema;
  readonly eventSchema = SlackEventSchema;
  readonly actionSchema = SlackActionSchema;

  private config?: SlackConfig;
  private client?: WebClient;
  private lastCheckTimestamp: string = '0';

  async initialize(config: SlackConfig): Promise<void> {
    this.config = config;

    // Initialize Slack client
    this.client = new WebClient(config.token, {
      logLevel: LogLevel.WARN,
    });

    // Verify token and get bot user ID
    try {
      const authResult = await this.client.auth.test();

      if (!authResult.ok) {
        throw new Error('Slack authentication failed');
      }

      // Store bot user ID for filtering messages
      this.config.botUserId = authResult.user_id as string;

      // Verify channel access
      for (const channel of config.channels) {
        const info = await this.client.conversations.info({ channel });
        if (!info.ok) {
          throw new Error(`Cannot access channel: ${channel}`);
        }
      }
    } catch (error) {
      throw new Error(
        `Slack initialization failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async listen(): Promise<SlackEvent[]> {
    if (!this.client || !this.config) {
      return [];
    }

    const events: SlackEvent[] = [];

    // Fetch messages from each channel since last check
    for (const channel of this.config.channels) {
      try {
        const result = await this.client.conversations.history({
          channel,
          oldest: this.lastCheckTimestamp,
          limit: 100,
        });

        if (!result.ok || !result.messages) {
          continue;
        }

        // Filter out bot's own messages and convert to events
        for (const message of result.messages) {
          // Skip bot's own messages
          if (message.user === this.config.botUserId) {
            continue;
          }

          // Determine event type
          const isMention = message.text?.includes(`<@${this.config.botUserId}>`);
          const type = isMention ? 'mention' : 'message';

          events.push({
            type,
            channel,
            user: message.user || 'unknown',
            text: message.text || '',
            timestamp: message.ts || '',
            threadTs: message.thread_ts,
          });
        }
      } catch (error) {
        console.error(`Error fetching messages from ${channel}:`, error);
      }
    }

    // Update last check timestamp
    if (events.length > 0) {
      const latestTs = events.reduce((max, evt) =>
        evt.timestamp > max ? evt.timestamp : max,
        this.lastCheckTimestamp
      );
      this.lastCheckTimestamp = latestTs;
    }

    return events;
  }

  async execute(action: SlackAction): Promise<unknown> {
    if (!this.client) {
      throw new Error('Slack client not initialized');
    }

    switch (action.type) {
      case 'send-message': {
        if (!action.text) {
          throw new Error('Message text required');
        }

        // Security: Ensure no credentials in message text
        assertNoCredentialsInText(action.text, 'message text');

        const result = await this.client.chat.postMessage({
          channel: action.channel,
          text: action.text,
          thread_ts: action.threadTs,
        });

        return result;
      }

      case 'add-reaction': {
        if (!action.reaction || !action.messageTs) {
          throw new Error('Reaction and message timestamp required');
        }

        // Validate reaction emoji name (alphanumeric, hyphens, underscores only)
        if (!/^[\w-]+$/.test(action.reaction)) {
          throw new Error('Invalid reaction emoji name');
        }

        const result = await this.client.reactions.add({
          channel: action.channel,
          name: action.reaction,
          timestamp: action.messageTs,
        });

        return result;
      }

      case 'update-message': {
        if (!action.text || !action.messageTs) {
          throw new Error('Message text and timestamp required for update');
        }

        // Security: Ensure no credentials in message text
        assertNoCredentialsInText(action.text, 'message text');

        const result = await this.client.chat.update({
          channel: action.channel,
          text: action.text,
          ts: action.messageTs,
        });

        return result;
      }

      default:
        throw new Error(`Unknown action type: ${(action as any).type}`);
    }
  }

  async updateConfig(updates: Partial<SlackConfig>): Promise<SlackConfig> {
    if (!this.config) {
      throw new Error('Plugin not initialized');
    }

    const newConfig = { ...this.config, ...updates };

    // Re-initialize if token changed
    if (updates.token && updates.token !== this.config.token) {
      await this.shutdown();
      await this.initialize(newConfig);
    } else {
      this.config = newConfig;
    }

    return newConfig;
  }

  getConfig(): SlackConfig {
    if (!this.config) {
      throw new Error('Plugin not initialized');
    }
    return { ...this.config };
  }

  async healthCheck(): Promise<PluginHealthStatus> {
    if (!this.client) {
      return {
        healthy: false,
        message: 'Client not initialized',
      };
    }

    try {
      const result = await this.client.auth.test();

      return {
        healthy: result.ok || false,
        message: result.ok ? 'Connected to Slack' : 'Authentication failed',
        metadata: {
          team: result.team,
          user: result.user,
          botId: result.bot_id,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        message: error instanceof Error ? error.message : String(error),
        lastError: error instanceof Error ? error : undefined,
      };
    }
  }

  async shutdown(): Promise<void> {
    this.client = undefined;
    this.lastCheckTimestamp = '0';
  }
}
