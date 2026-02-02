/**
 * .claude/plugins.json template generator
 */

export function generatePluginsJson(): string {
  const config = {
    workspaces: ["packages/*", "packs/*"],
    slack: {
      enabled: false,
      workspace: "",
      channels: [],
      threadNotifications: true,
      summaryFrequency: "daily",
    },
    github: {
      enabled: false,
      repositories: [],
      issueLabels: [],
      autoRespond: false,
    },
    fileWatcher: {
      enabled: false,
      paths: [],
      ignorePatterns: ["node_modules/**", ".git/**", "dist/**"],
    },
  };

  return JSON.stringify(config, null, 2) + "\n";
}
