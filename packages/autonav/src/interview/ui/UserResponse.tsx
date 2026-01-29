/**
 * User response display with rounded borders
 *
 * Shows user input with a prompt indicator and rounded box styling.
 */

import { Box, Text } from "ink";
import { colors, boxChars } from "./theme.js";
import { wrapText } from "./text-utils.js";

interface UserResponseProps {
  /** User's response text */
  content: string;
}

/** Maximum content width (will wrap text to fit) */
const MAX_WIDTH = 76;

/** Prompt indicator shown before user text */
const PROMPT = "▸ ";

export function UserResponse({ content }: UserResponseProps): React.ReactNode {
  const { rounded } = boxChars;

  // Wrap text to fit within max width (accounting for prompt on first line)
  const lines = wrapText(content, MAX_WIDTH - PROMPT.length);
  const contentWidth = MAX_WIDTH;

  // Inner width includes 1 space padding on each side
  const innerWidth = contentWidth + 2;

  const topBorder = rounded.topLeft + rounded.horizontal.repeat(innerWidth) + rounded.topRight;
  const bottomBorder = rounded.bottomLeft + rounded.horizontal.repeat(innerWidth) + rounded.bottomRight;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={colors.dimmed}>{topBorder}</Text>
      {lines.map((line, i) => (
        <Text key={i} color={colors.dimmed}>
          {rounded.vertical + " "}
          {i === 0 && <Text color={colors.primary}>{PROMPT}</Text>}
          <Text color="white">
            {i === 0 ? line.padEnd(contentWidth - PROMPT.length) : line.padEnd(contentWidth)}
          </Text>
          {" " + rounded.vertical}
        </Text>
      ))}
      <Text color={colors.dimmed}>{bottomBorder}</Text>
    </Box>
  );
}
