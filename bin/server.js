#!/usr/bin/env node

// Wrapper script for npx execution
// This file is executed when running: npx @dallask/a11y-mcp-srv
import('../dist/server.js').catch((error) => {
  console.error('Error starting server:', error);
  process.exit(1);
});
