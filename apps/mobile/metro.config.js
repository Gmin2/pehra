const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

// the repo root is a pnpm workspace, keep metro rooted here and let it watch the root for shared packages
const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')
const config = getDefaultConfig(projectRoot)
config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules'), path.resolve(workspaceRoot, 'node_modules')]
// the web try page: no keychain in a browser, the few stored values go to local storage
const resolve = config.resolver.resolveRequest
config.resolver.resolveRequest = (ctx, name, platform) => {
  if (platform === 'web' && name === 'expo-secure-store') return { type: 'sourceFile', filePath: path.resolve(projectRoot, 'src/web/secure-store.ts') }
  if (platform === 'web' && name === 'isows') return { type: 'sourceFile', filePath: path.resolve(projectRoot, 'src/web/isows.ts') }
  return (resolve ?? ctx.resolveRequest)(ctx, name, platform)
}
module.exports = config
