import path from 'path'
import isRunning from 'is-running'
import http from 'http'
import { statSync, createReadStream } from 'fs'
import * as fixtureSetup from '../fixtures/app-test-setup.js'
const distDir = path.resolve(fixtureSetup.fixtureDir, 'app', 'dist')

function startDevServer() {
  const app = http.createServer((req, res) => {
    if (req.method === 'GET') {
      if (req.url === '/') {
        const indexPath = path.join(distDir, 'index.html')
        const stat = statSync(indexPath)
        res.writeHead(200, {
          'Content-Type': 'text/html',
          'Content-Length': stat.size
        })
        createReadStream(indexPath).pipe(res)
      }
    }
  })

  const port = 7001

  const server = app.listen(port)
  return {
    server,
    url: `http://localhost:${port}`
  }
}

function runDevTest(tauriConfig) {
  fixtureSetup.initJest('app')
  return new Promise(async (resolve, reject) => {
    try {
      process.chdir(path.join(fixtureSetup.fixtureDir, 'app'))
      const { dev } = await import('dist/api/cli')
      const { promise, pid } = await dev({ config: tauriConfig })

      let success = false
      const checkIntervalId = setInterval(async () => {
        if (!isRunning(pid) && !success) {
          const failedCommands = Object.keys(responses)
            .filter((k) => responses[k] === null)
            .join(', ')
          server.close(() => reject("App didn't reply to " + failedCommands))
        }
      }, 2000)

      const { server, responses } = fixtureSetup.startServer(async () => {
        success = true
        clearInterval(checkIntervalId)
        // wait for the app process to be killed
        setTimeout(async () => {
          try {
            process.kill(pid)
          } catch {}
          resolve()
        }, 2000)
      })
      await promise
    } catch (error) {
      reject(error)
    }
  })
}

describe('Tauri Dev', () => {
  const build = {
    distDir: distDir,
    withGlobalTauri: true
  }

  const devServer = startDevServer()

  it.each`
    url
    ${devServer.url}
    ${distDir}
  `('works with dev pointing to $url', ({ url }) => {
    const runningDevServer = url.startsWith('http')
    const promise = runDevTest({
      build: {
        ...build,
        devPath: url
      }
    })

    promise.then(() => {
      if (runningDevServer) {
        devServer.server.close()
      }
    })

    return promise
  })
})
