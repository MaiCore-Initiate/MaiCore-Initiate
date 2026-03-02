import { useState, useEffect, useRef } from 'react'
import { Terminal as XTerm } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Plus, X } from 'lucide-react'
import 'xterm/css/xterm.css'

interface Terminal {
  id: string
  title: string
  xterm: XTerm
  fitAddon: FitAddon
  ws: WebSocket | null
  containerRef: HTMLDivElement | null
}

export default function WebShell() {
  const [terminals, setTerminals] = useState<Terminal[]>([])
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null)
  const terminalContainerRef = useRef<HTMLDivElement>(null)

  // 创建新终端
  const createTerminal = async () => {
    try {
      // 调用后端 API 创建终端会话
      const response = await fetch('/api/terminal/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shell: 'cmd' })
      })

      if (!response.ok) {
        console.error('创建终端失败')
        return
      }

      const data = await response.json()
      const terminalId = data.terminal_id

      // 创建 xterm 实例
      const xterm = new XTerm({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: 'Consolas, "Courier New", monospace',
        theme: {
          background: '#1e1e1e',
          foreground: '#d4d4d4',
          cursor: '#ffffff',
          black: '#000000',
          red: '#cd3131',
          green: '#0dbc79',
          yellow: '#e5e510',
          blue: '#2472c8',
          magenta: '#bc3fbc',
          cyan: '#11a8cd',
          white: '#e5e5e5',
          brightBlack: '#666666',
          brightRed: '#f14c4c',
          brightGreen: '#23d18b',
          brightYellow: '#f5f543',
          brightBlue: '#3b8eea',
          brightMagenta: '#d670d6',
          brightCyan: '#29b8db',
          brightWhite: '#e5e5e5'
        }
      })

      // 添加插件
      const fitAddon = new FitAddon()
      const webLinksAddon = new WebLinksAddon()
      xterm.loadAddon(fitAddon)
      xterm.loadAddon(webLinksAddon)

      // 建立 WebSocket 连接
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${proto}://${location.host}/ws`)

      let isSubscribed = false

      ws.onopen = () => {
        console.log('WebSocket 已连接')
        // 订阅终端频道
        ws.send(JSON.stringify({
          type: 'subscribe',
          channel: `terminal_${terminalId}`
        }))
      }

      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data)
        console.log('收到消息:', msg)

        if (msg.type === 'subscribed') {
          console.log('已订阅频道:', msg.channel)
          isSubscribed = true
        } else if (msg.type === 'terminal_output') {
          xterm.write(msg.data)
        } else if (msg.type === 'terminal_exit') {
          xterm.write('\r\n\x1b[31m[进程已退出]\x1b[0m\r\n')
        }
      }

      ws.onerror = (error) => {
        console.error('WebSocket 错误:', error)
      }

      ws.onclose = () => {
        console.log('WebSocket 连接已关闭')
      }

      // 监听终端输入
      xterm.onData((data) => {
        console.log('终端输入:', data.charCodeAt(0), data)
        if (ws.readyState === WebSocket.OPEN && isSubscribed) {
          ws.send(JSON.stringify({
            type: 'terminal_input',
            terminal_id: terminalId,
            data: data
          }))
        } else {
          console.warn('WebSocket 未就绪或未订阅')
        }
      })

      // 监听终端大小变化
      xterm.onResize(({ cols, rows }) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'terminal_resize',
            terminal_id: terminalId,
            rows: rows,
            cols: cols
          }))
        }
      })

      // 创建终端对象
      const newTerminal: Terminal = {
        id: terminalId,
        title: `终端 ${terminals.length + 1}`,
        xterm,
        fitAddon,
        ws,
        containerRef: null
      }

      setTerminals(prev => [...prev, newTerminal])
      setActiveTerminalId(terminalId)

      // 延迟挂载和适配大小
      setTimeout(() => {
        const container = document.getElementById(`terminal-${terminalId}`)
        if (container) {
          xterm.open(container)
          fitAddon.fit()
          xterm.focus()
        }
      }, 100)

    } catch (error) {
      console.error('创建终端失败:', error)
    }
  }

  // 关闭终端
  const closeTerminal = async (terminalId: string) => {
    const terminal = terminals.find(t => t.id === terminalId)
    if (!terminal) return

    try {
      // 关闭 WebSocket
      if (terminal.ws) {
        terminal.ws.close()
      }

      // 销毁 xterm 实例
      terminal.xterm.dispose()

      // 调用后端 API 关闭终端
      await fetch(`/api/terminal/${terminalId}`, {
        method: 'DELETE'
      })

      // 从列表中移除
      setTerminals(prev => prev.filter(t => t.id !== terminalId))

      // 如果关闭的是当前活动终端，切换到第一个
      if (activeTerminalId === terminalId) {
        const remaining = terminals.filter(t => t.id !== terminalId)
        setActiveTerminalId(remaining.length > 0 ? remaining[0].id : null)
      }
    } catch (error) {
      console.error('关闭终端失败:', error)
    }
  }

  // 切换终端
  const switchTerminal = (terminalId: string) => {
    setActiveTerminalId(terminalId)
    setTimeout(() => {
      const terminal = terminals.find(t => t.id === terminalId)
      if (terminal) {
        terminal.fitAddon.fit()
        terminal.xterm.focus()
      }
    }, 50)
  }

  // 监听窗口大小变化
  useEffect(() => {
    const handleResize = () => {
      terminals.forEach(terminal => {
        if (terminal.id === activeTerminalId) {
          terminal.fitAddon.fit()
        }
      })
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [terminals, activeTerminalId])

  // 清理所有终端
  useEffect(() => {
    return () => {
      terminals.forEach(terminal => {
        if (terminal.ws) {
          terminal.ws.close()
        }
        terminal.xterm.dispose()
      })
    }
  }, [])

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-black/20 to-black/10 rounded-2xl overflow-hidden backdrop-blur-sm border border-white/10 shadow-2xl">
      {/* 标签栏 */}
      <div className="flex items-center gap-2 px-4 py-3 bg-black/30 backdrop-blur-md border-b border-white/10">
        {terminals.map(terminal => (
          <div
            key={terminal.id}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer transition-all
              ${activeTerminalId === terminal.id
                ? 'bg-white/20 text-white shadow-lg border border-white/20'
                : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80 border border-transparent'
              }
            `}
            onClick={() => switchTerminal(terminal.id)}
          >
            <span className="text-sm font-medium">{terminal.title}</span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                closeTerminal(terminal.id)
              }}
              className="hover:text-red-400 transition-colors p-0.5 hover:bg-red-500/20 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
        <button
          onClick={createTerminal}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 hover:text-blue-100 transition-all border border-blue-400/30 hover:border-blue-400/50 shadow-md"
        >
          <Plus className="w-4 h-4" />
          <span className="text-sm font-medium">新建终端</span>
        </button>
      </div>

      {/* 终端容器 */}
      <div ref={terminalContainerRef} className="flex-1 relative bg-[#1e1e1e] overflow-hidden">
        {terminals.length === 0 ? (
          <div className="flex items-center justify-center h-full text-white/40">
            <div className="text-center">
              <Plus className="w-20 h-20 mx-auto mb-4 opacity-20" />
              <p className="text-xl mb-2 font-medium">暂无终端</p>
              <p className="text-sm opacity-70">点击"新建终端"开始使用 WebShell</p>
            </div>
          </div>
        ) : (
          terminals.map(terminal => (
            <div
              key={terminal.id}
              id={`terminal-${terminal.id}`}
              className={`absolute inset-0 p-4 ${activeTerminalId === terminal.id ? 'block' : 'hidden'}`}
              style={{
                fontFamily: 'Consolas, "Courier New", monospace'
              }}
            />
          ))
        )}
      </div>
    </div>
  )
}
