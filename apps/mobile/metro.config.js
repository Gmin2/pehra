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
  const found = (resolve ?? ctx.resolveRequest)(ctx, name, platform)
  // the money moves and the watch key play out in the browser, src/web/sim.ts
  if (platform === 'web' && found.type === 'sourceFile' && !ctx.originModulePath.includes(`${path.sep}src${path.sep}web${path.sep}`)) {
    const swap = { 'src/fund.ts': 'src/web/fund.ts', 'src/guard.ts': 'src/web/guard.ts' }[path.relative(projectRoot, found.filePath)]
    if (swap) return { type: 'sourceFile', filePath: path.resolve(projectRoot, swap) }
  }
  return found
}
module.exports = config
