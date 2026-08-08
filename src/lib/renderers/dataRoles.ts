export interface DataRoleContract {
  collection: 'groups' | 'series'
  colorField: 'fill' | 'color' | 'line'
  min?: number
  max?: number
}

export interface ResolvedDataRole {
  index: number
  key: string
  label: string
  color: string
  colorPath: string
  source: Record<string, unknown>
}

export type ExtractResolvedDataRolesResult =
  | { ok: true; roles: ResolvedDataRole[] }
  | { ok: false; code: 'INVALID_DATA_ROLES' | 'MISSING_RESOLVED_COLOR'; message: string }

/**
 * Extract only the explicitly declared data-mark roles for a renderer.
 * Structural roles under `elements` are deliberately outside this contract.
 */
export function extractResolvedDataRoles(
  colorRoles: unknown,
  resolvedColors: Record<string, string>,
  contract: DataRoleContract
): ExtractResolvedDataRolesResult {
  if (!isRecord(colorRoles)) {
    return {
      ok: false,
      code: 'INVALID_DATA_ROLES',
      message: `Expected color_roles.${contract.collection} to be an array.`
    }
  }

  const collectionValue = colorRoles[contract.collection]
  if (!Array.isArray(collectionValue)) {
    return {
      ok: false,
      code: 'INVALID_DATA_ROLES',
      message: `Expected color_roles.${contract.collection} to be an array.`
    }
  }
  const candidates = collectionValue
  const min = contract.min ?? 1
  const max = contract.max ?? 5
  if (candidates.length < min || candidates.length > max) {
    return {
      ok: false,
      code: 'INVALID_DATA_ROLES',
      message: `color_roles.${contract.collection} must contain ${min} to ${max} data roles.`
    }
  }

  const roles: ResolvedDataRole[] = []
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]
    if (
      !isRecord(candidate) ||
      typeof candidate.key !== 'string' ||
      typeof candidate.label !== 'string' ||
      !Object.prototype.hasOwnProperty.call(candidate, contract.colorField)
    ) {
      return {
        ok: false,
        code: 'INVALID_DATA_ROLES',
        message: `Invalid data role at color_roles.${contract.collection}[${index}].`
      }
    }

    const colorPath = `color_roles.${contract.collection}[${index}].${contract.colorField}`
    const color = resolvedColors[colorPath]
    if (!color) {
      return {
        ok: false,
        code: 'MISSING_RESOLVED_COLOR',
        message: `Missing resolved data color for ${colorPath}.`
      }
    }
    roles.push({
      index,
      key: candidate.key,
      label: candidate.label,
      color,
      colorPath,
      source: candidate
    })
  }

  return { ok: true, roles }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
