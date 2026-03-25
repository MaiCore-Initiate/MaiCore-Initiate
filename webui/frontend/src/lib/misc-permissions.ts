import type { MiscTab } from '../types'
import type { ActionPermissionKey } from './account-system'

export const MISC_TAB_PERMISSION_MAP: Record<MiscTab, ActionPermissionKey> = {
  about: 'misc.about.access',
  author: 'misc.author.access',
  tech: 'misc.tech.access',
  libs: 'misc.libs.access',
  license: 'misc.license.access',
  components: 'misc.components.access',
  webshell: 'misc.webshell.access',
  screensaver: 'misc.screensaver.access',
  'desktop-pet': 'misc.desktop-pet.access',
  'custom-console': 'misc.custom-console.access',
  'template-market': 'misc.template-market.access',
}

export function getMiscTabPermission(tab?: MiscTab): ActionPermissionKey | null {
  if (!tab) return null
  return MISC_TAB_PERMISSION_MAP[tab]
}
