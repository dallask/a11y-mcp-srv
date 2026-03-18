/**
 * Semantic-release plugin: update only the root package version in package-lock.json
 * so it stays in sync with package.json without changing any dependency versions.
 *
 * Updates:
 * - lockfile.version (top-level)
 * - lockfile.packages[""].version (root package entry)
 */

const fs = require('fs');
const path = require('path');

module.exports = {
  prepare(pluginConfig, context) {
    const version = context.nextRelease.version;
    const cwd = context.cwd || process.cwd();
    const lockfilePath = path.join(cwd, 'package-lock.json');

    if (!fs.existsSync(lockfilePath)) {
      context.logger.log('No package-lock.json found, skipping lockfile version sync.');
      return;
    }

    const lockfile = JSON.parse(fs.readFileSync(lockfilePath, 'utf8'));
    lockfile.version = version;
    if (lockfile.packages && typeof lockfile.packages[''] === 'object') {
      lockfile.packages[''].version = version;
    }
    fs.writeFileSync(lockfilePath, JSON.stringify(lockfile, null, 2), 'utf8');
    context.logger.log('Updated package-lock.json version to %s', version);
  },
};
