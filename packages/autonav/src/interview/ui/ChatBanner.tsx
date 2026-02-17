/**
 * Welcome banner for chat mode
 *
 * Follows the same double-line box pattern as Banner.tsx with
 * navigator name and model info instead of creation context.
 */

import { Box, Text } from "ink";
import { colors, boxChars } from "./theme.js";

interface ChatBannerProps {
  /** Navigator name */
  navigatorName: string;
  /** Model being used */
  model: string;
  /** Version string */
  version?: string;
}

/** Fixed inner width for the banner box */
const INNER_WIDTH = 60;

export function ChatBanner({
  navigatorName,
  model,
  version,
}: ChatBannerProps): React.ReactNode {
  const { double } = boxChars;

  // Block letter AUTONAV (same as Banner.tsx)
  const logoLine1 = " ▄▀█ █░█ ▀█▀ █▀█ █▄░█ ▄▀█ █░█";
  const logoLine2 = " █▀█ █▄█ ░█░ █▄█ █░▀█ █▀█ ▀▄▀";

  // Info lines
  const navLine = `  Navigator   ${navigatorName}`;
  const modelLine = `  Model       ${model}`;
  const versionSuffix = version ? `  v${version}` : "";
  const helpLine = `  /help for commands  ·  Ctrl+C twice to exit${versionSuffix}`;

  const topBorder =
    double.topLeft + double.horizontal.repeat(INNER_WIDTH) + double.topRight;
  const midBorder =
    double.leftT + double.horizontal.repeat(INNER_WIDTH) + double.rightT;
  const bottomBorder =
    double.bottomLeft +
    double.horizontal.repeat(INNER_WIDTH) +
    double.bottomRight;
  const emptyLine =
    double.vertical + " ".repeat(INNER_WIDTH) + double.vertical;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={colors.dimmed}>{topBorder}</Text>
      <Text color={colors.dimmed}>
        {double.vertical}
        <Text color={colors.primary}>{logoLine1.padEnd(INNER_WIDTH)}</Text>
        {double.vertical}
      </Text>
      <Text color={colors.dimmed}>
        {double.vertical}
        <Text color={colors.primary}>{logoLine2.padEnd(INNER_WIDTH)}</Text>
        {double.vertical}
      </Text>
      <Text color={colors.dimmed}>{midBorder}</Text>
      <Text color={colors.dimmed}>
        {double.vertical}
        <Text color="white">{navLine.padEnd(INNER_WIDTH)}</Text>
        {double.vertical}
      </Text>
      <Text color={colors.dimmed}>
        {double.vertical}
        <Text color="white">{modelLine.padEnd(INNER_WIDTH)}</Text>
        {double.vertical}
      </Text>
      <Text color={colors.dimmed}>{emptyLine}</Text>
      <Text color={colors.dimmed}>
        {double.vertical}
        <Text color={colors.accent}>{helpLine.padEnd(INNER_WIDTH)}</Text>
        {double.vertical}
      </Text>
      <Text color={colors.dimmed}>{bottomBorder}</Text>
    </Box>
  );
}
