/**
 * Welcome banner with block-letter AUTONAV header
 */

import { Box, Text } from "ink";
import { colors, boxChars } from "./theme.js";

interface BannerProps {
  /** Navigator name being created */
  name: string;
  /** Version string */
  version?: string;
}

export function Banner({ name, version = "1.2.0" }: BannerProps) {
  const { double } = boxChars;
  const width = 62;

  // Block letter AUTONAV (simplified for better readability)
  const line1 = " ▄▀█ █░█ ▀█▀ █▀█ █▄░█ ▄▀█ █░█";
  const line2 = " █▀█ █▄█ ░█░ █▄█ █░▀█ █▀█ ▀▄▀";

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={colors.dimmed}>
        {double.topLeft + double.horizontal.repeat(width) + double.topRight}
      </Text>
      <Text color={colors.dimmed}>
        {double.vertical}
        <Text color={colors.primary}>{line1}</Text>
        {"".padEnd(width - line1.length - 1)}
        {double.vertical}
      </Text>
      <Text color={colors.dimmed}>
        {double.vertical}
        <Text color={colors.primary}>{line2}</Text>
        {"".padEnd(width - line2.length - 1)}
        {double.vertical}
      </Text>
      <Text color={colors.dimmed}>
        {double.leftT + double.horizontal.repeat(width) + double.rightT}
      </Text>
      <Text color={colors.dimmed}>
        {double.vertical}
        {" "}
        <Text color={colors.accent}>Creating:</Text>
        {" "}
        <Text color="white">{name}</Text>
        {"".padEnd(width - name.length - 12)}
        <Text color={colors.dimmed}>v{version}</Text>
        {"  "}
        {double.vertical}
      </Text>
      <Text color={colors.dimmed}>
        {double.bottomLeft + double.horizontal.repeat(width) + double.bottomRight}
      </Text>
    </Box>
  );
}
