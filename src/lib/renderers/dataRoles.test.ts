import { extractResolvedDataRoles } from './dataRoles'

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

const roles = {
  groups: [
    { key: 'control', label: 'Control', fill: { source: 'palette', color_id: 'c1' } },
    { key: 'treated', label: 'Treated', fill: { source: 'palette', color_id: 'c2' } }
  ],
  elements: {
    axis: { source: 'palette', color_id: 'c3' },
    grid: { source: 'palette', color_id: 'c4' },
    background: { source: 'palette', color_id: 'c5' }
  }
}

const result = extractResolvedDataRoles(roles, {
  'color_roles.groups[0].fill': '#111111',
  'color_roles.groups[1].fill': '#222222',
  'color_roles.elements.axis': '#333333',
  'color_roles.elements.grid': '#444444',
  'color_roles.elements.background': '#555555'
}, {
  collection: 'groups',
  colorField: 'fill'
})

expect(result.ok, 'resolved data roles should be extracted')
if (result.ok) {
  expect(result.roles.length === 2, 'structural element colors must not be counted as data roles')
  expect(result.roles.map((role) => role.color).join(',') === '#111111,#222222', 'data roles should retain resolved mark colors in role order')
}

const missing = extractResolvedDataRoles(roles, {
  'color_roles.groups[0].fill': '#111111'
}, {
  collection: 'groups',
  colorField: 'fill'
})
expect(!missing.ok && missing.code === 'MISSING_RESOLVED_COLOR', 'every declared data role must have a resolved mark color')
