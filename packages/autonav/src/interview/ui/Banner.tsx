/**
 * Welcome banner with block-letter AUTONAV header
 *
 * Uses a fixed-width box with simple string padding for alignment.
 */

import { Box, Text } from "ink";
import { colors, boxChars } from "./theme.js";

interface BannerProps {
  /** Navigator name being created */
  name: string;
  /** Version string */
  version?: string;
}

/** Fixed inner width for the banner box */
const INNER_WIDTH = 60;

export function Banner({ name, version = "1.2.0" }: BannerProps): React.ReactNode {
  const { double } = boxChars;

  // Block letter AUTONAV (30 chars each)
  const logoLine1 = " ▄▀█ █░█ ▀█▀ █▀█ █▄░█ ▄▀█ █░█";
  const logoLine2 = " █▀█ █▄█ ░█░ █▄█ █░▀█ █▀█ ▀▄▀";

  // Build info line with proper spacing
  const infoLine = ` Creating: ${name}`.padEnd(INNER_WIDTH - version.length - 2) + `v${version} `;

  const topBorder = double.topLeft + double.horizontal.repeat(INNER_WIDTH) + double.topRight;
  const midBorder = double.leftT + double.horizontal.repeat(INNER_WIDTH) + double.rightT;
  const bottomBorder = double.bottomLeft + double.horizontal.repeat(INNER_WIDTH) + double.bottomRight;

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
        <Text color="white">{infoLine}</Text>
        {double.vertical}
      </Text>
      <Text color={colors.dimmed}>{bottomBorder}</Text>
    </Box>
  );
}
