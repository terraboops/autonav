#!/usr/bin/env node
/**
 * Test script for Matrix-style ActivityIndicator
 *
 * Shows all combinations of glyph sets and line counts
 * Run with: npm run test:indicator
 */

import { createElement } from "react";
import { render, Box, Text } from "ink";
import chalk from "chalk";
import { ActivityIndicator } from "./ActivityIndicator.js";
import { glyphSetA, glyphSetB, glyphSetC, glyphSetD, glyphSetE } from "./theme.js";

function TestApp() {
  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold>
          {chalk.rgb(0, 255, 70)("▓▒░ MATRIX ACTIVITY INDICATOR TEST ░▒▓")}
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text color="gray">
          Compare glyph sets (A-E) and line counts (1-3). Press Ctrl+C to exit.
        </Text>
      </Box>

      {/* Glyph Set A: Classic Mix */}
      <Box marginTop={1} marginBottom={1}>
        <Text bold color="cyan">A. Classic Mix (Letters + Numbers + Symbols + Blocks)</Text>
      </Box>
      <Box marginBottom={1}>
        <Text color="green">A1. Single line</Text>
      </Box>
      <ActivityIndicator message="thinking..." width={50} lines={1} glyphSet={glyphSetA} />
      <Box marginTop={1} marginBottom={1}>
        <Text color="green">A2. Two lines</Text>
      </Box>
      <ActivityIndicator message="processing..." width={50} lines={2} glyphSet={glyphSetA} />
      <Box marginTop={1} marginBottom={1}>
        <Text color="green">A3. Three lines</Text>
      </Box>
      <ActivityIndicator message="analyzing..." width={50} lines={3} glyphSet={glyphSetA} />

      {/* Glyph Set B: Block Heavy */}
      <Box marginTop={2} marginBottom={1}>
        <Text bold color="cyan">B. Block Heavy (Mostly blocks + symbols)</Text>
      </Box>
      <Box marginBottom={1}>
        <Text color="green">B1. Single line</Text>
      </Box>
      <ActivityIndicator message="thinking..." width={50} lines={1} glyphSet={glyphSetB} />
      <Box marginTop={1} marginBottom={1}>
        <Text color="green">B2. Two lines</Text>
      </Box>
      <ActivityIndicator message="processing..." width={50} lines={2} glyphSet={glyphSetB} />
      <Box marginTop={1} marginBottom={1}>
        <Text color="green">B3. Three lines</Text>
      </Box>
      <ActivityIndicator message="analyzing..." width={50} lines={3} glyphSet={glyphSetB} />

      {/* Glyph Set C: Numbers + Symbols */}
      <Box marginTop={2} marginBottom={1}>
        <Text bold color="cyan">C. Digital (Numbers + Symbols)</Text>
      </Box>
      <Box marginBottom={1}>
        <Text color="green">C1. Single line</Text>
      </Box>
      <ActivityIndicator message="thinking..." width={50} lines={1} glyphSet={glyphSetC} />
      <Box marginTop={1} marginBottom={1}>
        <Text color="green">C2. Two lines</Text>
      </Box>
      <ActivityIndicator message="processing..." width={50} lines={2} glyphSet={glyphSetC} />
      <Box marginTop={1} marginBottom={1}>
        <Text color="green">C3. Three lines</Text>
      </Box>
      <ActivityIndicator message="analyzing..." width={50} lines={3} glyphSet={glyphSetC} />

      {/* Glyph Set D: Box Drawing */}
      <Box marginTop={2} marginBottom={1}>
        <Text bold color="cyan">D. Geometric (Box drawing + blocks)</Text>
      </Box>
      <Box marginBottom={1}>
        <Text color="green">D1. Single line</Text>
      </Box>
      <ActivityIndicator message="thinking..." width={50} lines={1} glyphSet={glyphSetD} />
      <Box marginTop={1} marginBottom={1}>
        <Text color="green">D2. Two lines</Text>
      </Box>
      <ActivityIndicator message="processing..." width={50} lines={2} glyphSet={glyphSetD} />
      <Box marginTop={1} marginBottom={1}>
        <Text color="green">D3. Three lines</Text>
      </Box>
      <ActivityIndicator message="analyzing..." width={50} lines={3} glyphSet={glyphSetD} />

      {/* Glyph Set E: Minimal */}
      <Box marginTop={2} marginBottom={1}>
        <Text bold color="cyan">E. Minimal (Blocks + Numbers only)</Text>
      </Box>
      <Box marginBottom={1}>
        <Text color="green">E1. Single line</Text>
      </Box>
      <ActivityIndicator message="thinking..." width={50} lines={1} glyphSet={glyphSetE} />
      <Box marginTop={1} marginBottom={1}>
        <Text color="green">E2. Two lines</Text>
      </Box>
      <ActivityIndicator message="processing..." width={50} lines={2} glyphSet={glyphSetE} />
      <Box marginTop={1} marginBottom={1}>
        <Text color="green">E3. Three lines</Text>
      </Box>
      <ActivityIndicator message="analyzing..." width={50} lines={3} glyphSet={glyphSetE} />
    </Box>
  );
}

render(createElement(TestApp));
