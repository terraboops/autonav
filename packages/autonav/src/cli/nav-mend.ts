#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import * as path from "node:path";
import { mendNavigator, type MendCheckResult } from "../mend/index.js";

const program = new Command();

program
  .name("autonav mend")
  .description("Health check and repair for navigators")
  .version("1.0.0")
  .argument("<navigator>", "Path to the navigator directory")
  .option("--auto-fix", "Automatically fix issues when possible")
  .option("--no-color", "Disable colored output")
  .action(async (navigatorPath: string, options: { autoFix?: boolean; noColor?: boolean }) => {
    if (options.noColor) {
      chalk.level = 0;
    }

    const navPath = path.resolve(navigatorPath);

    console.log(chalk.bold(`🔧 Mending navigator: ${navPath}`));
    console.log("");

    // Show backup warning
    if (options.autoFix) {
      console.log(chalk.yellow.bold("⚠️  WARNING: Auto-fix will modify navigator files"));
      console.log(chalk.yellow("   Please back up your navigator before proceeding."));
      console.log("");
      console.log(chalk.dim(`   Recommended: git commit or copy ${navPath}`));
      console.log("");
    }

    const result = await mendNavigator(navPath, {
      autoFix: false, // Always run check-only first
      quiet: false,
    });

    // Display check results
    console.log(chalk.bold("Health Checks:"));
    console.log("");

    for (const check of result.checks) {
      const icon = getStatusIcon(check.status);
      const statusColor = getStatusColor(check.status);

      console.log(`${icon} ${statusColor(check.check)}`);
      console.log(`  ${check.message}`);

      if (check.details) {
        console.log(chalk.dim(`  ${check.details}`));
      }

      if (check.status === "fail" && check.autoFixable) {
        console.log(chalk.yellow(`  💡 Can be auto-fixed`));
      }

      console.log("");
    }

    // If auto-fix requested and there are fixable issues, ask for confirmation
    const fixableIssues = result.checks.filter(c => c.status === "fail" && c.autoFixable);

    if (options.autoFix && fixableIssues.length > 0) {
      console.log(chalk.bold("Proposed Auto-Fixes:"));
      console.log("");

      for (const issue of fixableIssues) {
        console.log(chalk.yellow(`  • ${issue.check}`));
        console.log(chalk.dim(`    ${issue.message}`));
      }

      console.log("");
      console.log(chalk.yellow.bold("⚠️  The following changes will be made:"));
      console.log(chalk.dim("   - Create missing directories"));
      console.log(chalk.dim("   - Create and symlink missing skills"));
      console.log("");

      // Ask for confirmation
      const readline = await import("node:readline/promises");
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const answer = await rl.question(chalk.bold("Apply these fixes? (yes/no): "));
      rl.close();

      if (answer.toLowerCase() !== "yes" && answer.toLowerCase() !== "y") {
        console.log("");
        console.log(chalk.yellow("Auto-fix cancelled. No changes made."));
        process.exit(0);
      }

      console.log("");
      console.log(chalk.bold("Applying fixes..."));
      console.log("");

      // Now run mend with auto-fix enabled
      const fixResult = await mendNavigator(navPath, {
        autoFix: true,
        quiet: false,
      });

      // Display fixes that were applied
      if (fixResult.fixes.length > 0) {
        console.log(chalk.bold("Auto-Fixes Applied:"));
        console.log("");

        for (const fix of fixResult.fixes) {
          const icon = fix.success ? "✓" : "✗";
          const color = fix.success ? chalk.green : chalk.red;

          console.log(`${icon} ${color(fix.check)}`);
          console.log(`  ${fix.action}`);
          console.log("");
        }
      }

      // Update result to show final state
      result.healthy = fixResult.healthy;
      result.checks = fixResult.checks;
      result.fixes = fixResult.fixes;
    }

    // Summary
    console.log(chalk.bold("Summary:"));
    console.log("");

    const passCount = result.checks.filter(c => c.status === "pass").length;
    const failCount = result.checks.filter(c => c.status === "fail").length;
    const warningCount = result.checks.filter(c => c.status === "warning").length;

    console.log(`  ${chalk.green("Passed:")} ${passCount}`);
    if (warningCount > 0) {
      console.log(`  ${chalk.yellow("Warnings:")} ${warningCount}`);
    }
    if (failCount > 0) {
      console.log(`  ${chalk.red("Failed:")} ${failCount}`);
    }
    console.log("");

    if (result.healthy) {
      console.log(chalk.green.bold("✓ Navigator is healthy!"));
    } else {
      console.log(chalk.red.bold("✗ Navigator has issues"));

      const fixableCount = result.checks.filter(c => c.status === "fail" && c.autoFixable).length;

      if (fixableCount > 0 && !options.autoFix) {
        console.log("");
        console.log(chalk.yellow(`💡 ${fixableCount} issue(s) can be auto-fixed. Run with --auto-fix flag:`));
        console.log(chalk.dim(`   autonav mend ${navigatorPath} --auto-fix`));
      }

      process.exit(1);
    }
  });

function getStatusIcon(status: MendCheckResult["status"]): string {
  switch (status) {
    case "pass":
      return chalk.green("✓");
    case "fail":
      return chalk.red("✗");
    case "warning":
      return chalk.yellow("⚠");
  }
}

function getStatusColor(status: MendCheckResult["status"]) {
  switch (status) {
    case "pass":
      return chalk.green;
    case "fail":
      return chalk.red;
    case "warning":
      return chalk.yellow;
  }
}

program.parse(process.argv);
