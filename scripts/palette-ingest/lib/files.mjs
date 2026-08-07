import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import {
  ALLOWED_REFERENCE_EXTENSIONS,
  MAX_MANIFEST_BYTES,
  MAX_REFERENCE_BYTES
} from './constants.mjs'

export function issue(pathValue, code, message, source = 'input') {
  return { path: pathValue, code, message, severity: 'error', source }
}

export function readJSONFile(filePath, maxBytes = MAX_MANIFEST_BYTES, boundaryRoot = null) {
  const linkStat = fs.lstatSync(filePath)
  if (linkStat.isSymbolicLink()) throw new Error(`Symbolic links are not allowed: ${filePath}`)
  if (boundaryRoot) assertRealPathContained(boundaryRoot, filePath)
  const stat = fs.statSync(filePath)
  if (!stat.isFile()) throw new Error(`Not a regular file: ${filePath}`)
  if (stat.size > maxBytes) throw new Error(`File exceeds ${maxBytes} bytes: ${filePath}`)
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

export function resolveContainedFile(root, relativePath) {
  if (typeof relativePath !== 'string' || relativePath.length === 0 || path.isAbsolute(relativePath)) {
    throw new Error('Referenced path must be a non-empty relative path')
  }
  const rootReal = fs.realpathSync(root)
  const resolved = path.resolve(rootReal, relativePath)
  const prefix = `${rootReal}${path.sep}`
  if (resolved !== rootReal && !resolved.startsWith(prefix)) {
    throw new Error('Referenced path escapes the source package root')
  }
  const targetReal = fs.realpathSync(resolved)
  if (targetReal !== rootReal && !targetReal.startsWith(prefix)) throw new Error('Referenced path escapes the source package root')
  const extension = path.extname(targetReal).toLowerCase()
  if (!ALLOWED_REFERENCE_EXTENSIONS.has(extension)) {
    throw new Error(`Referenced file type is not allowed: ${extension || '<none>'}`)
  }
  const stat = fs.statSync(targetReal)
  if (!stat.isFile()) throw new Error('Referenced path is not a regular file')
  if (stat.size > MAX_REFERENCE_BYTES) throw new Error(`Referenced file exceeds ${MAX_REFERENCE_BYTES} bytes`)
  return targetReal
}

export function safeSegment(value, label = 'path segment') {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(value)) {
    throw new Error(`Unsafe ${label}: ${String(value)}`)
  }
  return value
}

export function containedPath(root, ...segments) {
  const resolvedRoot = path.resolve(root)
  const resolved = path.resolve(resolvedRoot, ...segments)
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error('Artifact path escapes artifact root')
  }
  return resolved
}

export function atomicWriteJSON(filePath, value, artifactRoot) {
  if (!artifactRoot) throw new Error('Artifact root is required for atomic writes')
  ensureSafeArtifactDirectory(artifactRoot, path.dirname(filePath))
  if (fs.existsSync(filePath)) {
    const targetStat = fs.lstatSync(filePath)
    if (targetStat.isSymbolicLink()) throw new Error(`Artifact target must not be a symbolic link: ${filePath}`)
    if (!targetStat.isFile()) throw new Error(`Artifact target is not a regular file: ${filePath}`)
  }
  const temporary = `${filePath}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    fs.renameSync(temporary, filePath)
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary)
  }
}

export function atomicWriteText(filePath, value, artifactRoot) {
  if (!artifactRoot) throw new Error('Artifact root is required for atomic writes')
  if (typeof value !== 'string') throw new Error('Text artifact value must be a string')
  ensureSafeArtifactDirectory(artifactRoot, path.dirname(filePath))
  if (fs.existsSync(filePath)) {
    const targetStat = fs.lstatSync(filePath)
    if (targetStat.isSymbolicLink()) throw new Error(`Artifact target must not be a symbolic link: ${filePath}`)
    if (!targetStat.isFile()) throw new Error(`Artifact target is not a regular file: ${filePath}`)
  }
  const temporary = `${filePath}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`
  try {
    fs.writeFileSync(temporary, value, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    fs.renameSync(temporary, filePath)
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary)
  }
}

export function ensureSafeArtifactDirectory(artifactRoot, targetDirectory) {
  const rootPath = path.resolve(artifactRoot)
  fs.mkdirSync(rootPath, { recursive: true })
  const rootStat = fs.lstatSync(rootPath)
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error('Artifact root must be a real directory, not a symbolic link')
  const targetPath = containedPath(rootPath, path.relative(rootPath, path.resolve(targetDirectory)))
  const relative = path.relative(rootPath, targetPath)
  let current = rootPath
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment)
    if (!fs.existsSync(current)) fs.mkdirSync(current)
    const stat = fs.lstatSync(current)
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Artifact directory must not be a symbolic link: ${current}`)
    assertRealPathContained(rootPath, current)
  }
  return targetPath
}

export function assertRealPathContained(root, target) {
  const rootPath = path.resolve(root)
  const rootStat = fs.lstatSync(rootPath)
  if (rootStat.isSymbolicLink()) throw new Error(`Boundary root must not be a symbolic link: ${rootPath}`)
  const rootReal = fs.realpathSync(rootPath)
  const targetReal = fs.realpathSync(target)
  if (targetReal !== rootReal && !targetReal.startsWith(`${rootReal}${path.sep}`)) throw new Error(`Path escapes its real boundary: ${target}`)
  return targetReal
}

export function listPackageDirectories(batchRoot) {
  return fs.readdirSync(batchRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(batchRoot, entry.name))
    .filter((directory) => fs.existsSync(path.join(directory, 'manifest.json')))
    .sort()
}
