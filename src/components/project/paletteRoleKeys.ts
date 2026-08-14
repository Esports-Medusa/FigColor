export function roleKeyFromLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'color'
}

export function createUniqueRoleKey(label: string, existingKeys: readonly string[]): string {
  const base = roleKeyFromLabel(label)
  const used = new Set(existingKeys)
  if (!used.has(base)) return base

  let suffix = 2
  while (used.has(`${base}_${suffix}`)) suffix += 1
  return `${base}_${suffix}`
}
