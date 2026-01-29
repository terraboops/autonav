#!/usr/bin/env node
/**
 * Test script for Matrix-style ActivityIndicator
 *
 * Run with: npm run test:indicator
 */

import { createElement } from "react";
import { render, Box, Text } from "ink";
import chalk from "chalk";
import { ActivityIndicator } from "./ActivityIndicator.js";

function TestApp() {
  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold>
          {chalk.rgb(0, 255, 70)("▓▒░ MATRIX ACTIVITY INDICATOR POC ░▒▓")}
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text color="gray">
          Watch the brightness wave flow through katakana glyphs. Press Ctrl+C to exit.
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text color="green">Default: 40 chars, 80ms interval</Text>
      </Box>
      <ActivityIndicator message="thinking..." />

      <Box marginTop={2} marginBottom={1}>
        <Text color="green">Compact: 30 chars</Text>
      </Box>
      <ActivityIndicator message="processing..." width={30} />

      <Box marginTop={2} marginBottom={1}>
        <Text color="green">Wide: 60 chars, slower wave</Text>
      </Box>
      <ActivityIndicator message="analyzing..." width={60} interval={120} />
    </Box>
  );
}

render(createElement(TestApp));
