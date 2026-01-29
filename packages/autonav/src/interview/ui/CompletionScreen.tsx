/**
 * Completion screen shown when navigator is successfully created
 */

import { Box, Text } from "ink";
import { colors, boxChars } from "./theme.js";

interface CompletionScreenProps {
  /** Name of the created navigator */
  navigatorName: string;
}

export function CompletionScreen({ navigatorName }: CompletionScreenProps) {
  const { double } = boxChars;
  const width = 62;

  // Block letter CREATED (simplified)
  const line1 = "  ░█▀▀░█▀▄░█▀▀░█▀█░▀█▀░█▀▀░█▀▄";
  const line2 = "  ░█░░░█▀▄░█▀▀░█▀█░░█░░█▀▀░█░█";
  const line3 = "  ░▀▀▀░▀░▀░▀▀▀░▀░▀░░▀░░▀▀▀░▀▀░";

  return (
    <Box flexDirection="column">
      <Text color={colors.dimmed}>
        {double.topLeft + double.horizontal.repeat(width) + double.topRight}
      </Text>
      <Text color={colors.dimmed}>{double.vertical}{"".padEnd(width)}{double.vertical}</Text>
      <Text color={colors.dimmed}>
        {double.vertical}
        <Text color={colors.primary}>{line1}</Text>
        {"".padEnd(width - line1.length)}
        {double.vertical}
      </Text>
      <Text color={colors.dimmed}>
        {double.vertical}
        <Text color={colors.primary}>{line2}</Text>
        {"".padEnd(width - line2.length)}
        {double.vertical}
      </Text>
      <Text color={colors.dimmed}>
        {double.vertical}
        <Text color={colors.primary}>{line3}</Text>
        {"".padEnd(width - line3.length)}
        {double.vertical}
      </Text>
      <Text color={colors.dimmed}>{double.vertical}{"".padEnd(width)}{double.vertical}</Text>
      <Text color={colors.dimmed}>
        {double.vertical}
        {"  "}
        <Text color={colors.accent}>Location</Text>
        {"   "}
        <Text color="white">./{navigatorName}</Text>
        {"".padEnd(width - navigatorName.length - 15)}
        {double.vertical}
      </Text>
      <Text color={colors.dimmed}>
        {double.vertical}
        {"  "}
        <Text color={colors.accent}>Run</Text>
        {"        "}
        <Text color="white">autonav chat {navigatorName}</Text>
        {"".padEnd(width - navigatorName.length - 27)}
        {double.vertical}
      </Text>
      <Text color={colors.dimmed}>{double.vertical}{"".padEnd(width)}{double.vertical}</Text>
      <Text color={colors.dimmed}>
        {double.bottomLeft + double.horizontal.repeat(width) + double.bottomRight}
      </Text>
    </Box>
  );
}
