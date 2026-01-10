#!/usr/bin/env node

// Wrapper script for npx execution
// This file is executed when running: npx @ali0113/accessibility-mcp-server
import('../dist/server.js').catch((error) => {
  console.error('Error starting server:', error);
  process.exit(1);
});
