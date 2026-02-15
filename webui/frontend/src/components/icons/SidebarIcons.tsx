const I = (props: React.SVGProps<SVGSVGElement>) => ({ ...props, width: 28, height: 28, viewBox: "0 0 28 28", fill: "none", xmlns: "http://www.w3.org/2000/svg" })

const s = "currentColor"

export function HomeIcon(p: React.SVGProps<SVGSVGElement>) {
  return <svg {...I(p)}><path d="M3 11L14 3L25 11V24C25 24.5304 24.7893 25.0391 24.4142 25.4142C24.0391 25.7893 23.5304 26 23 26H5C4.46957 26 3.96086 25.7893 3.58579 25.4142C3.21071 25.0391 3 24.5304 3 24V11Z" stroke={s} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M10 26V14H18V26" stroke={s} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
}

export function InstancesIcon(p: React.SVGProps<SVGSVGElement>) {
  return <svg {...I(p)}><rect x="3" y="3" width="22" height="10" rx="2" stroke={s} strokeWidth="2"/><rect x="3" y="15" width="22" height="10" rx="2" stroke={s} strokeWidth="2"/><circle cx="7" cy="8" r="1.5" fill={s}/><circle cx="7" cy="20" r="1.5" fill={s}/></svg>
}

export function ConfigIcon(p: React.SVGProps<SVGSVGElement>) {
  return <svg {...I(p)}><path d="M14 18C16.2091 18 18 16.2091 18 14C18 11.7909 16.2091 10 14 10C11.7909 10 10 11.7909 10 14C10 16.2091 11.7909 18 14 18Z" stroke={s} strokeWidth="2"/><path d="M22.7 17.7C22.5 18.2 22.6 18.7 23 19.1L23.1 19.2C23.4 19.5 23.6 19.9 23.6 20.4C23.6 20.9 23.4 21.3 23.1 21.6C22.8 21.9 22.4 22.1 21.9 22.1C21.4 22.1 21 21.9 20.7 21.6L20.6 21.5C20.2 21.1 19.7 21 19.2 21.2C18.7 21.4 18.4 21.8 18.4 22.4V22.5C18.4 23.6 17.5 24.5 16.4 24.5H15.6C14.5 24.5 13.6 23.6 13.6 22.5V22.4C13.6 21.8 13.2 21.3 12.7 21.1C12.2 20.9 11.7 21 11.3 21.4L11.2 21.5C10.6 22.1 9.6 22.1 9 21.5C8.7 21.2 8.5 20.8 8.5 20.3C8.5 19.8 8.7 19.4 9 19.1L9.1 19C9.5 18.6 9.6 18.1 9.4 17.6C9.2 17.1 8.8 16.8 8.2 16.8H8C6.9 16.8 6 15.9 6 14.8V14C6 12.9 6.9 12 8 12H8.1C8.7 12 9.2 11.6 9.4 11.1C9.6 10.6 9.5 10.1 9.1 9.7L9 9.6C8.4 9 8.4 8 9 7.4C9.3 7.1 9.7 6.9 10.2 6.9C10.7 6.9 11.1 7.1 11.4 7.4L11.5 7.5C11.9 7.9 12.4 8 12.9 7.8H13C13.5 7.6 13.8 7.2 13.8 6.6V6.5C13.8 5.4 14.7 4.5 15.8 4.5H16.2C17.3 4.5 18.2 5.4 18.2 6.5V6.6C18.2 7.2 18.5 7.6 19 7.8C19.5 8 20 7.9 20.4 7.5L20.5 7.4C21.1 6.8 22.1 6.8 22.7 7.4C23 7.7 23.2 8.1 23.2 8.6C23.2 9.1 23 9.5 22.7 9.8L22.6 9.9C22.2 10.3 22.1 10.8 22.3 11.3V11.4C22.5 11.9 22.9 12.2 23.5 12.2H23.6C24.7 12.2 25.6 13.1 25.6 14.2V14.6C25.6 15.7 24.7 16.6 23.6 16.6H23.5C22.9 16.6 22.5 16.9 22.3 17.4V17.7Z" stroke={s} strokeWidth="1.5"/></svg>
}

export function KnowledgeIcon(p: React.SVGProps<SVGSVGElement>) {
  return <svg {...I(p)}><path d="M4 4H10C11.0609 4 12.0783 4.42143 12.8284 5.17157C13.5786 5.92172 14 6.93913 14 8V25C14 24.2044 13.6839 23.4413 13.1213 22.8787C12.5587 22.3161 11.7956 22 11 22H4V4Z" stroke={s} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M24 4H18C16.9391 4 15.9217 4.42143 15.1716 5.17157C14.4214 5.92172 14 6.93913 14 8V25C14 24.2044 14.3161 23.4413 14.8787 22.8787C15.4413 22.3161 16.2044 22 17 22H24V4Z" stroke={s} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
}

export function DbMigrationIcon(p: React.SVGProps<SVGSVGElement>) {
  return <svg {...I(p)}><ellipse cx="14" cy="7" rx="10" ry="4" stroke={s} strokeWidth="2"/><path d="M4 7V14C4 16.2 8.5 18 14 18C19.5 18 24 16.2 24 14V7" stroke={s} strokeWidth="2"/><path d="M4 14V21C4 23.2 8.5 25 14 25C19.5 25 24 23.2 24 21V14" stroke={s} strokeWidth="2"/></svg>
}

export function PluginsIcon(p: React.SVGProps<SVGSVGElement>) {
  return <svg {...I(p)}><path d="M8 12V8H12" stroke={s} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M20 12V8H16" stroke={s} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M8 16V20H12" stroke={s} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M20 16V20H16" stroke={s} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><rect x="3" y="3" width="22" height="22" rx="3" stroke={s} strokeWidth="2"/></svg>
}

export function DeployIcon(p: React.SVGProps<SVGSVGElement>) {
  return <svg {...I(p)}><path d="M14 3L25 9V19L14 25L3 19V9L14 3Z" stroke={s} strokeWidth="2" strokeLinejoin="round"/><path d="M14 25V14" stroke={s} strokeWidth="2"/><path d="M25 9L14 14L3 9" stroke={s} strokeWidth="2"/></svg>
}

export function StatusIcon(p: React.SVGProps<SVGSVGElement>) {
  return <svg {...I(p)}><path d="M3 14H7L10 5L14 23L18 11L21 14H25" stroke={s} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
}

export function LogsIcon(p: React.SVGProps<SVGSVGElement>) {
  return <svg {...I(p)}><rect x="4" y="3" width="20" height="22" rx="2" stroke={s} strokeWidth="2"/><path d="M9 8H19" stroke={s} strokeWidth="2" strokeLinecap="round"/><path d="M9 13H19" stroke={s} strokeWidth="2" strokeLinecap="round"/><path d="M9 18H15" stroke={s} strokeWidth="2" strokeLinecap="round"/></svg>
}

export function MiscIcon(p: React.SVGProps<SVGSVGElement>) {
  return <svg {...I(p)}><circle cx="7" cy="7" r="3" stroke={s} strokeWidth="2"/><circle cx="21" cy="7" r="3" stroke={s} strokeWidth="2"/><circle cx="7" cy="21" r="3" stroke={s} strokeWidth="2"/><circle cx="21" cy="21" r="3" stroke={s} strokeWidth="2"/></svg>
}

export function SettingsIcon(p: React.SVGProps<SVGSVGElement>) {
  return <svg {...I(p)}><path d="M4 7H24" stroke={s} strokeWidth="2" strokeLinecap="round"/><path d="M4 14H24" stroke={s} strokeWidth="2" strokeLinecap="round"/><path d="M4 21H24" stroke={s} strokeWidth="2" strokeLinecap="round"/><circle cx="9" cy="7" r="2.5" fill="white" stroke={s} strokeWidth="2"/><circle cx="19" cy="14" r="2.5" fill="white" stroke={s} strokeWidth="2"/><circle cx="12" cy="21" r="2.5" fill="white" stroke={s} strokeWidth="2"/></svg>
}
