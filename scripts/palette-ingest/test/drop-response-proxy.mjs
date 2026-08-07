import fs from 'node:fs'
import http from 'node:http'

const [listenPort, upstreamOrigin, readyFile] = process.argv.slice(2)
if (!listenPort || !upstreamOrigin || !readyFile) throw new Error('listen port, upstream origin, and ready file are required')
const upstream = new URL(upstreamOrigin)

const server = http.createServer((clientRequest, clientResponse) => {
  const upstreamRequest = http.request(new URL(clientRequest.url, upstream), {
    method: clientRequest.method,
    headers: clientRequest.headers
  }, (upstreamResponse) => {
    upstreamResponse.on('data', () => {})
    upstreamResponse.on('end', () => clientResponse.destroy())
  })
  upstreamRequest.on('error', () => clientResponse.destroy())
  clientRequest.pipe(upstreamRequest)
})

server.listen(Number(listenPort), '127.0.0.1', () => fs.writeFileSync(readyFile, 'ready\n', { mode: 0o600 }))
