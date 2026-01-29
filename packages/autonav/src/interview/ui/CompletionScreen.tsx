/**
 * Completion screen shown when navigator is successfully created
 *
 * Displays a success banner with the navigator location and run command.
 */

import { Box, Text } from "ink";
import { colors, boxChars } from "./theme.js";

interface CompletionScreenProps {
  /** Name of the created navigator */
  navigatorName: string;
}

/** Fixed inner width for the completion box */
const INNER_WIDTH = 60;

/**
 * Create an empty line within the box
 */
function emptyLine(left: string, right: string, width: number): string {
  return left + " ".repeat(width) + right;
}

/**
 * Create a content line with proper padding
 * Returns the total character count for the line content
 */
function paddedContent(content: string, width: number): string {
  return content.padEnd(width);
}

export function CompletionScreen({ navigatorName }: CompletionScreenProps): React.ReactNode {
  const { double } = boxChars;

  // Block letter CREATED (31 chars each)
  const logoLine1 = "  ░█▀▀░█▀▄░█▀▀░█▀█░▀█▀░█▀▀░█▀▄";
  const logoLine2 = "  ░█░░░█▀▄░█▀▀░█▀█░░█░░█▀▀░█░█";
  const logoLine3 = "  ░▀▀▀░▀░▀░▀▀▀░▀░▀░░▀░░▀▀▀░▀▀░";

  // Build info lines
  const locationPath = `./${navigatorName}`;
  const runCommand = `autonav chat ${navigatorName}`;

  // Calculate padding for aligned labels
  // "  Location   ./{name}"
  // "  Run        autonav chat {name}"
  const locationContent = `  Location   ${locationPath}`;
  const runContent = `  Run        ${runCommand}`;

  const topBorder = double.topLeft + double.horizontal.repeat(INNER_WIDTH) + double.topRight;
  const bottomBorder = double.bottomLeft + double.horizontal.repeat(INNER_WIDTH) + double.bottomRight;
  const empty = emptyLine(double.vertical, double.vertical, INNER_WIDTH);

  return (
    <Box flexDirection="column">
      <Text color={colors.dimmed}>{topBorder}</Text>
      <Text color={colors.dimmed}>{empty}</Text>
      <Text color={colors.dimmed}>
        {double.vertical}
        <Text color={colors.primary}>{paddedContent(logoLine1, INNER_WIDTH)}</Text>
        {double.vertical}
      </Text>
      <Text color={colors.dimmed}>
        {double.vertical}
        <Text color={colors.primary}>{paddedContent(logoLine2, INNER_WIDTH)}</Text>
        {double.vertical}
      </Text>
      <Text color={colors.dimmed}>
        {double.vertical}
        <Text color={colors.primary}>{paddedContent(logoLine3, INNER_WIDTH)}</Text>
        {double.vertical}
      </Text>
      <Text color={colors.dimmed}>{empty}</Text>
      <Text color={colors.dimmed}>
        {double.vertical}
        {"  "}
        <Text color={colors.accent}>Location</Text>
        {"   "}
        <Text color="white">{locationPath}</Text>
        {" ".repeat(Math.max(0, INNER_WIDTH - locationContent.length))}
        {double.vertical}
      </Text>
      <Text color={colors.dimmed}>
        {double.vertical}
        {"  "}
        <Text color={colors.accent}>Run</Text>
        {"        "}
        <Text color="white">{runCommand}</Text>
        {" ".repeat(Math.max(0, INNER_WIDTH - runContent.length))}
        {double.vertical}
      </Text>
      <Text color={colors.dimmed}>{empty}</Text>
      <Text color={colors.dimmed}>{bottomBorder}</Text>
    </Box>
  );
}
