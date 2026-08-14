import modalSource from './PaletteEditModal.vue?raw'
import { createUniqueRoleKey, roleKeyFromLabel } from './paletteRoleKeys'

function expect(condition: boolean, message: string): void { if (!condition) throw new Error(message) }

expect(!modalSource.includes('Key (auto)'), 'Project palette editor should not expose internal role keys')
expect(!modalSource.includes('class="role-key"'), 'Project palette editor should not render a role key field')
expect(modalSource.includes('isNew: false'), 'Loaded roles should be marked as existing')
expect(modalSource.includes('isNew: true'), 'Added roles should be marked as new')
expect(modalSource.includes('filter(role => !role.isNew)'), 'Existing keys should seed uniqueness without being rewritten')
expect(modalSource.includes('if (role.isNew)'), 'Only newly-added roles should receive generated keys')
expect(modalSource.includes('key: role.key'), 'Saved payload should retain the resolved stable key')

expect(roleKeyFromLabel('Treatment Group') === 'treatment_group', 'Role labels should normalize to readable keys')
expect(roleKeyFromLabel('  Color 1  ') === 'color_1', 'Whitespace and spaces should normalize predictably')
expect(createUniqueRoleKey('Treatment Group', ['control', 'treatment_group']) === 'treatment_group_2', 'Duplicate keys should receive a suffix')
expect(createUniqueRoleKey('Treatment Group', ['treatment_group', 'treatment_group_2']) === 'treatment_group_3', 'Key suffixes should remain unique')
