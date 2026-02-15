import { LogOut, User, Bell } from 'lucide-react'

interface HeaderProps {
  onLogout: () => void
}

export default function Header({ onLogout }: HeaderProps) {
  return (
    <header className="h-[87px] bg-card border-b border-border flex items-center justify-between px-6">
      {/* 左侧空白 - 页面标题会在内容区域显示 */}
      <div></div>

      {/* 右侧操作按钮 */}
      <div className="flex items-center gap-4">
        <button className="p-2 hover:bg-muted rounded-lg transition-colors">
          <Bell className="w-5 h-5 text-muted-foreground" />
        </button>
        
        <button className="flex items-center gap-2 p-2 hover:bg-muted rounded-lg transition-colors">
          <User className="w-5 h-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">管理员</span>
        </button>

        <button 
          onClick={onLogout}
          className="flex items-center gap-2 px-4 py-2 hover:bg-muted rounded-lg transition-colors text-destructive"
        >
          <LogOut className="w-5 h-5" />
          <span className="text-sm">退出</span>
        </button>
      </div>
    </header>
  )
}
