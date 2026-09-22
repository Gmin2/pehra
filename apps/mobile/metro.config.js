const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

// the repo root is a pnpm workspace, keep metro rooted here and let it watch the root for shared packages
const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')
const config = getDefaultConfig(projectRoot)
config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules'), path.resolve(workspaceRoot, 'node_modules')]
module.exports = config
