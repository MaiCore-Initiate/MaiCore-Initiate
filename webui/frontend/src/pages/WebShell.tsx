import { useState, useEffect, useRef } from 'react'
import { Terminal as XTerm } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { CanvasAddon } from '@xterm/addon-canvas'
import { Plus, X, Maximize2, Minimize2 } from 'lucide-react'
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
  const [isImmersive, setIsImmersive] = useState(false)
  const terminalContainerRef = useRef<HTMLDivElement>(null)

  // 创建新终端
  const createTerminal = async () => {
    try {
      console.log('开始创建终端...')
      // 调用后端 API 创建终端会话
      const response = await fetch('/api/terminal/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shell: 'powershell' })  // 使用 PowerShell
      })

      console.log('API 响应状态:', response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('创建终端失败:', response.status, errorText)
        return
      }

      const data = await response.json()
      console.log('终端创建成功:', data)
      const terminalId = data.terminal_id

      // 创建 xterm 实例
      const xterm = new XTerm({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: '"JetBrainsMono Nerd Font", "JetBrains Mono", "HarmonyOS Sans SC", Consolas, "Courier New", monospace',
        allowTransparency: true,
        theme: {
          background: '#00000000',  // 透明背景
          foreground: '#cccccc',
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
          brightWhite: '#e5e5e5',
          selectionBackground: '#3a3d41'
        },
        cursorInactiveStyle: 'outline',
        drawBoldTextInBrightColors: false,
        lineHeight: 1.2
      })

      // 添加插件
      const fitAddon = new FitAddon()
      const webLinksAddon = new WebLinksAddon()
      const canvasAddon = new CanvasAddon()

      xterm.loadAddon(fitAddon)
      xterm.loadAddon(webLinksAddon)
      xterm.loadAddon(canvasAddon)  // 使用 Canvas 渲染器提升性能

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

          // 使用 ResizeObserver 自动调整终端大小
          const resizeObserver = new ResizeObserver(() => {
            fitAddon.fit()
          })

          // 等待字体加载完成后再调整大小
          document.fonts.ready.then(() => {
            fitAddon.fit()
            resizeObserver.observe(container)
          })

          xterm.focus()

          // 清理函数
          newTerminal.containerRef = container as HTMLDivElement
          ;(container as any).__resizeObserver = resizeObserver
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
      // 清理 ResizeObserver
      if (terminal.containerRef) {
        const resizeObserver = (terminal.containerRef as any).__resizeObserver
        if (resizeObserver) {
          resizeObserver.disconnect()
        }
      }

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

  // 切换沉浸模式
  const toggleImmersive = () => {
    setIsImmersive(!isImmersive)
    // 延迟调整终端大小以适应新布局
    setTimeout(() => {
      const terminal = terminals.find(t => t.id === activeTerminalId)
      if (terminal) {
        terminal.fitAddon.fit()
      }
    }, 300)
  }

  // 清理所有终端
  useEffect(() => {
    return () => {
      terminals.forEach(terminal => {
        // 清理 ResizeObserver
        if (terminal.containerRef) {
          const resizeObserver = (terminal.containerRef as any).__resizeObserver
          if (resizeObserver) {
            resizeObserver.disconnect()
          }
        }

        // 关闭 WebSocket
        if (terminal.ws) {
          terminal.ws.close()
        }

        // 销毁终端实例
        terminal.xterm.dispose()
      })
    }
  }, [])

  // 沉浸模式渲染
  if (isImmersive) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl animate-fade-in">
        <div className="absolute inset-6 flex flex-col bg-gradient-to-br from-black/40 to-black/60 rounded-3xl overflow-hidden backdrop-blur-md border border-white/10 shadow-2xl animate-scale-in">
          {/* 沉浸模式标签栏 */}
          <div className="flex items-center justify-between px-6 py-4 bg-black/40 backdrop-blur-lg border-b border-white/10">
            <div className="flex items-center gap-3">
              {terminals.map(terminal => (
                <div
                  key={terminal.id}
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-xl cursor-pointer transition-all duration-200
                    ${activeTerminalId === terminal.id
                      ? 'bg-white/20 text-white shadow-lg border border-white/30 scale-105'
                      : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80 border border-transparent hover:scale-105'
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
                    className="hover:text-red-400 transition-colors p-1 hover:bg-red-500/20 rounded"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                onClick={createTerminal}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 hover:text-blue-100 transition-all duration-200 border border-blue-400/30 hover:border-blue-400/50 shadow-md hover:scale-105"
              >
                <Plus className="w-4 h-4" />
                <span className="text-sm font-medium">新建</span>
              </button>
            </div>

            {/* 退出沉浸模式按钮 */}
            <button
              onClick={toggleImmersive}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all duration-200 border border-white/20 hover:border-white/30 shadow-md hover:scale-105"
            >
              <Minimize2 className="w-4 h-4" />
              <span className="text-sm font-medium">退出全屏</span>
            </button>
          </div>

          {/* 终端容器 */}
          <div ref={terminalContainerRef} className="flex-1 relative bg-black/60 backdrop-blur-sm">
            {terminals.length === 0 ? (
              <div className="flex items-center justify-center h-full text-white/40">
                <div className="text-center animate-fade-in">
                  <Plus className="w-24 h-24 mx-auto mb-6 opacity-20" />
                  <p className="text-2xl mb-3 font-medium">暂无终端</p>
                  <p className="text-base opacity-70">点击"新建"开始使用 WebShell</p>
                </div>
              </div>
            ) : (
              terminals.map(terminal => (
                <div
                  key={terminal.id}
                  id={`terminal-${terminal.id}`}
                  className={`absolute inset-0 p-6 ${activeTerminalId === terminal.id ? 'block' : 'hidden'}`}
                  style={{
                    fontFamily: 'Consolas, "Courier New", monospace'
                  }}
                />
              ))
            )}
          </div>
        </div>
      </div>
    )
  }

  // 普通模式渲染
  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-black/30 to-black/20 rounded-2xl overflow-hidden backdrop-blur-lg border border-white/20 shadow-2xl">
      {/* 标签栏 */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/40 backdrop-blur-xl border-b border-white/20">
        <div className="flex items-center gap-2">
          {terminals.map(terminal => (
            <div
              key={terminal.id}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer transition-all duration-200
                ${activeTerminalId === terminal.id
                  ? 'bg-white/25 text-white shadow-lg border border-white/30'
                  : 'bg-white/10 text-white/70 hover:bg-white/15 hover:text-white/90 border border-white/10'
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
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500/25 hover:bg-blue-500/35 text-blue-100 hover:text-white transition-all duration-200 border border-blue-400/40 hover:border-blue-400/60 shadow-md"
          >
            <Plus className="w-4 h-4" />
            <span className="text-sm font-medium">新建</span>
          </button>
        </div>

        {/* 沉浸模式按钮 */}
        {terminals.length > 0 && (
          <button
            onClick={toggleImmersive}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/15 hover:bg-white/20 text-white/90 hover:text-white transition-all duration-200 border border-white/25 hover:border-white/35 shadow-md"
          >
            <Maximize2 className="w-4 h-4" />
            <span className="text-sm font-medium">全屏</span>
          </button>
        )}
      </div>

      {/* 终端容器 */}
      <div ref={terminalContainerRef} className="flex-1 relative bg-black/50 backdrop-blur-sm overflow-hidden">
        {terminals.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-white/50">
            <div className="text-center">
              <Plus className="w-24 h-24 mx-auto mb-6 opacity-30" />
              <p className="text-2xl mb-3 font-medium">暂无终端</p>
              <p className="text-base opacity-80">点击"新建"开始使用 WebShell</p>
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
