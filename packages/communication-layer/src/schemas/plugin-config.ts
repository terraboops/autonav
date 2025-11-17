import { z } from 'zod';

/**
 * Slack Plugin Configuration Schema
 *
 * Configures how the navigator interacts with Slack
 */
export const SlackPluginSchema = z.object({
  /**
   * Whether Slack integration is enabled
   */
  enabled: z.boolean().describe('Enable Slack integration'),

  /**
   * Slack workspace ID or name
   */
  workspace: z.string().describe('Slack workspace identifier'),

  /**
   * Channels to monitor or post to
   */
  channels: z.array(z.string()).describe('List of Slack channel IDs or names'),

  /**
   * Whether to send thread notifications
   */
  threadNotifications: z.boolean().describe('Enable thread-based notifications'),
});

export type SlackPlugin = z.infer<typeof SlackPluginSchema>;

/**
 * Signal Plugin Configuration Schema
 *
 * Configures how the navigator interacts via Signal messaging
 */
export const SignalPluginSchema = z.object({
  /**
   * Whether Signal integration is enabled
   */
  enabled: z.boolean().describe('Enable Signal integration'),

  /**
   * Phone number for Signal communication
   */
  phoneNumber: z.string().describe('Signal phone number'),

  /**
   * Schedule for check-in messages (cron format)
   * Example: "0 15 * * *" = 3pm daily
   */
  checkInSchedule: z.string().describe('Check-in schedule in cron format'),

  /**
   * Types of notifications to send
   * Examples: "urgent", "daily-summary", "low-confidence-responses"
   */
  notificationTypes: z.array(z.string()).describe('Types of notifications to send'),
});

export type SignalPlugin = z.infer<typeof SignalPluginSchema>;

/**
 * Complete Plugin Configuration Schema
 *
 * Defines all available plugins for a navigator
 */
export const PluginConfigSchema = z.object({
  /**
   * Slack plugin configuration
   */
  slack: SlackPluginSchema.describe('Slack integration settings'),

  /**
   * Signal plugin configuration
   */
  signal: SignalPluginSchema.describe('Signal messaging settings'),
});

export type PluginConfig = z.infer<typeof PluginConfigSchema>;

/**
 * Helper to create default plugin configuration
 */
export function createDefaultPluginConfig(): PluginConfig {
  return {
    slack: {
      enabled: false,
      workspace: '',
      channels: [],
      threadNotifications: true,
    },
    signal: {
      enabled: false,
      phoneNumber: '',
      checkInSchedule: '0 9 * * *', // 9am daily by default
      notificationTypes: ['urgent'],
    },
  };
}

/**
 * Helper to validate plugin configuration
 */
export function validatePluginConfig(config: unknown): {
  valid: boolean;
  errors: string[];
} {
  const result = PluginConfigSchema.safeParse(config);

  if (result.success) {
    return { valid: true, errors: [] };
  }

  return {
    valid: false,
    errors: result.error.errors.map((e: { path: Array<string | number>; message: string }) =>
      `${e.path.join('.')}: ${e.message}`
    ),
  };
}
