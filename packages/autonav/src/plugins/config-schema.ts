import { z } from 'zod';

/**
 * Schema for .claude/plugins.json
 *
 * Example:
 * {
 *   "slack": {
 *     "enabled": true,
 *     "config": {
 *       "token": "xoxb-...",
 *       "channels": ["#general"],
 *       "threadNotifications": true
 *     }
 *   },
 *   "github": {
 *     "enabled": false,
 *     "config": {}
 *   }
 * }
 */
export const PluginConfigFileSchema = z.record(
  z.string(), // Plugin name
  z.object({
    enabled: z.boolean(),
    config: z.record(z.unknown()).optional(),
  })
);

export type PluginConfigFile = z.infer<typeof PluginConfigFileSchema>;
