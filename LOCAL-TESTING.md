# 🧪 Local Testing Guide for WAVE Accessibility MCP Server

This guide will help you test the MCP server locally before deploying it.

## 📋 Prerequisites

- Node.js 18 or higher
- An MCP client (Claude Desktop, Cursor, or custom client)
- Terminal/Command line access

## 🚀 Step-by-Step Setup

### Step 1: Build the Project

First, make sure you're in the mcp-server directory and build the project:

```bash
cd /Users/shekh/wave-tool-modify/wave-accessibility-audit/mcp-server

# Install dependencies (if not already done)
npm install

# Install Playwright browsers
npx playwright install chromium

# Build the TypeScript project
npm run build
```

**Expected output:**
- `dist/` folder created with compiled JavaScript files
- No TypeScript errors

### Step 2: Test the Server Standalone

Before connecting to an MCP client, test that the server starts correctly:

```bash
# Run the server directly
node dist/server.js
```

**Expected output:**
- The server should start without errors
- You'll see MCP protocol messages being written to stdout
- Press Ctrl+C to stop (it's normal for the server to keep running)

### Step 3: Configure Your MCP Client

Choose one of the following clients:

#### Option A: Claude Desktop (Recommended for testing)

1. **Locate the config file:**
   - **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
   - **Linux:** `~/.config/Claude/claude_desktop_config.json`

2. **Edit the config file** (create it if it doesn't exist):

```json
{
  "mcpServers": {
    "wave-accessibility": {
      "command": "node",
      "args": [
        "/Users/shekh/wave-tool-modify/wave-accessibility-audit/mcp-server/dist/server.js"
      ]
    }
  }
}
```

3. **Restart Claude Desktop** completely (quit and reopen)

4. **Verify connection:**
   - Look for a 🔌 icon in Claude Desktop
   - Check that the server is listed in the MCP servers panel
   - Try asking Claude: "Can you audit https://example.com for accessibility issues?"

#### Option B: Cursor IDE

1. **Open Cursor Settings** (Cmd/Ctrl + ,)

2. **Search for "MCP"** in settings

3. **Edit the MCP configuration** and add:

```json
{
  "mcpServers": {
    "wave-accessibility": {
      "command": "node",
      "args": [
        "/Users/shekh/wave-tool-modify/wave-accessibility-audit/mcp-server/dist/server.js"
      ]
    }
  }
}
```

4. **Restart Cursor**

5. **Test in chat:**
   - Open Cursor chat (Cmd/Ctrl + L)
   - Ask: "Use the wave-accessibility MCP to audit https://example.com"

#### Option C: Manual Testing with MCP Inspector

Use the MCP Inspector for direct testing without a client:

```bash
# Install MCP Inspector globally
npm install -g @modelcontextprotocol/inspector

# Run the inspector
npx @modelcontextprotocol/inspector node dist/server.js
```

This will open a web interface where you can:
- See all available tools
- Test tool calls manually
- View request/response in real-time

### Step 4: Test Basic Functionality

Once connected to a client, try these test scenarios:

#### Test 1: Simple URL Audit

**Prompt to client:**
```
Can you audit https://example.com for accessibility issues?
```

**Expected result:**
- The tool `audit_url` should be called
- You should get a summary of accessibility issues (if any)
- Score should be displayed (0-100)

#### Test 2: Batch Audit

**Prompt to client:**
```
Audit these URLs for accessibility: https://example.com, https://www.w3.org
```

**Expected result:**
- The tool `audit_multiple_urls` should be called
- Results for each URL
- Aggregated summary

#### Test 3: Get Quick Fixes

**Prompt to client:**
```
Audit https://www.w3.org/WAI/demos/bad/ and show me quick fixes
```

**Expected result:**
- Two tools called: `audit_url` then `get_quick_fixes`
- List of issues with code examples

#### Test 4: WCAG Compliance Check

**Prompt to client:**
```
Check WCAG AA compliance for https://example.com
```

**Expected result:**
- Tool `get_wcag_compliance` should be called
- Compliance percentage shown
- Per-criterion breakdown

#### Test 5: Compare Two URLs

**Prompt to client:**
```
Compare accessibility between https://example.com and https://www.w3.org
```

**Expected result:**
- Tool `compare_accessibility` should be called
- Score improvement/decline shown
- Issues fixed and introduced listed

## 🔍 Debugging Tips

### Check Server Logs

The server writes logs to stderr. To capture them:

```bash
# Run with logs visible
node dist/server.js 2> server-errors.log

# In another terminal, watch the logs
tail -f server-errors.log
```

### Common Issues and Solutions

#### Issue: "Cannot find module"
**Solution:** Make sure you ran `npm run build` to compile TypeScript to JavaScript

#### Issue: "Playwright browsers not installed"
**Solution:** Run `npx playwright install chromium`

#### Issue: "wave.min.js not found"
**Solution:** Ensure `wave.min.js` is in the mcp-server directory

#### Issue: Server not appearing in Claude Desktop
**Solutions:**
1. Check the config file path is correct
2. Verify JSON syntax is valid (use a JSON validator)
3. Use absolute paths, not relative paths
4. Restart Claude Desktop completely (quit, not just close window)
5. Check Claude Desktop logs:
   - macOS: `~/Library/Logs/Claude/`
   - Windows: `%APPDATA%\Claude\logs\`

#### Issue: "page.addScriptTag" CSP errors
**Solution:** This is expected for some websites with strict Content Security Policy. The error handler will retry and report gracefully.

### Verify Installation

Run this checklist:

```bash
cd /Users/shekh/wave-tool-modify/wave-accessibility-audit/mcp-server

# Check files exist
ls -la dist/server.js          # Should exist
ls -la wave.min.js             # Should exist
ls -la node_modules/playwright # Should exist

# Check build is up to date
npm run build

# Test server starts
timeout 5 node dist/server.js || echo "Server started successfully"
```

## 🧪 Advanced Testing

### Test with Custom Client

Create a simple test script:

```javascript
// test-client.js
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['dist/server.js']
});

const client = new Client({
  name: 'test-client',
  version: '1.0.0'
}, {
  capabilities: {}
});

await client.connect(transport);

// List available tools
const tools = await client.listTools();
console.log('Available tools:', tools);

// Call audit_url
const result = await client.callTool({
  name: 'audit_url',
  arguments: {
    url: 'https://example.com'
  }
});

console.log('Result:', result);

await client.close();
```

Run it:
```bash
node test-client.js
```

## ✅ Success Indicators

You know everything is working when:

1. ✅ Server starts without errors
2. ✅ Server appears in your MCP client
3. ✅ Tools are visible and callable
4. ✅ `audit_url` returns structured results
5. ✅ Playwright browser launches and pages load
6. ✅ WAVE analysis completes successfully
7. ✅ Results include prioritized issues and scores

## 📊 Expected Performance

- **Single URL audit:** 2-6 seconds
- **Batch audit (3 URLs):** 6-20 seconds (depends on parallel setting)
- **Session creation:** 3-8 seconds
- **Comparison/Analysis tools:** < 1 second (using cached results)

## 🎯 Next Steps

Once local testing is successful:

1. **Test all 13 tools** systematically
2. **Try edge cases** (invalid URLs, timeouts, etc.)
3. **Test session management** with authenticated pages
4. **Verify error handling** works as expected
5. **Check progress streaming** for batch operations
6. **Validate compliance reports** generate correctly

## 🆘 Getting Help

If you encounter issues:

1. Check the logs (stderr output)
2. Verify all prerequisites are installed
3. Test the server standalone first
4. Try the MCP Inspector for direct testing
5. Check that paths in config are absolute

---

**Happy testing! 🧪✨**

