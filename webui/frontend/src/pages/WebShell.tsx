import { useState, useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { WebglAddon } from '@xterm/addon-webgl'
import { Plus, X, Maximize2, Minimize2 } from 'lucide-react'
import '@xterm/xterm/css/xterm.css'
import '@xterm/addon-webgl/css/addon-webgl.css'

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
  const [isExitingImmersive, setIsExitingImmersive] = useState(false)
  const [fontSize, setFontSize] = useState(14)
  const [editingTerminalId, setEditingTerminalId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const terminalContainerRef = useRef<HTMLDivElement>(null)
  const terminalsRef = useRef<Terminal[]>([])
  const immersiveExitTimerRef = useRef<number | null>(null)
  const clickTimerRef = useRef<number | null>(null)

  useEffect(() => {
    terminalsRef.current = terminals
  }, [terminals])

  // 创建新终端
  const createTerminal = async () => {
    try {
      console.log('开始创建终端...')
      // 调用后端 API 创建终端会话
      const response = await fetch('/api/terminal/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shell: 'powershell' })  // 优先 PowerShell，后端失败会回退 CMD
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
        fontSize,
        fontFamily: '"JetBrainsMono Nerd Font", "Noto Sans SC", "Cascadia Code", "JetBrains Mono", Consolas, "Courier New", monospace',
        allowTransparency: true,
        scrollback: 2000,
        letterSpacing: 0,
        theme: {
          background: '#00000000',
          foreground: '#d8e1ff',
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
          selectionBackground: '#334155'
        },
        cursorInactiveStyle: 'outline',
        drawBoldTextInBrightColors: false,
        lineHeight: 1.15
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
      const sendTerminalResize = () => {
        if (ws.readyState !== WebSocket.OPEN || !isSubscribed) return
        ws.send(JSON.stringify({
          type: 'terminal_resize',
          terminal_id: terminalId,
          rows: xterm.rows,
          cols: xterm.cols
        }))
      }

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
          requestAnimationFrame(() => {
            fitAddon.fit()
            sendTerminalResize()
          })
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
        if (ws.readyState === WebSocket.OPEN && isSubscribed) {
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
        title: `终端 ${terminalsRef.current.length + 1}`,
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

          // 加载 WebGL 渲染插件（必须在 open() 之后，此时渲染上下文才存在）。
          // 创建失败或运行中 WebGL 上下文丢失时，自动 dispose 回退到默认 Canvas 渲染。
          try {
            const webglAddon = new WebglAddon()
            webglAddon.onContextLoss(() => {
              webglAddon.dispose()
            })
            xterm.loadAddon(webglAddon)
          } catch (err) {
            console.warn('[WebShell] WebGL 渲染不可用，已回退到默认渲染', err)
          }

          // 使用 ResizeObserver 自动调整终端大小
          const resizeObserver = new ResizeObserver(() => {
            fitAddon.fit()
            sendTerminalResize()
          })

          // 关键：必须等字体真正加载完成后再 fit，否则 xterm 用 fallback 字体
          // 测量字符宽度，等首选字体 swap 进来后字符宽度变了却不会重新测量，
          // 导致框选起终点相对鼠标固定偏移（往左上飘几个字符）。
          // document.fonts.ready 在字体还没开始加载时会立即 resolve，不可靠，
          // 这里显式 load 字体（同时声明 fontSize 和字体名）确保真正可用。
          const ensureFontReady = async () => {
            try {
              await Promise.all([
                document.fonts.load(`${fontSize}px "JetBrainsMono Nerd Font"`),
                document.fonts.load(`${fontSize}px "Noto Sans SC"`),
              ])
              await document.fonts.ready
            } catch {
              // 字体加载失败也继续，至少 fit 一次
            }
            // 重新赋值 fontFamily 触发 xterm 重新测量字符尺寸（remeasure）
            xterm.options.fontFamily = xterm.options.fontFamily
            fitAddon.fit()
            sendTerminalResize()
            resizeObserver.observe(container)
          }
          void ensureFontReady()

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
      setTerminals(prev => {
        const remaining = prev.filter(t => t.id !== terminalId)
        if (activeTerminalId === terminalId) {
          setActiveTerminalId(remaining.length > 0 ? remaining[0].id : null)
        }
        return remaining
      })
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
        if (terminal.ws?.readyState === WebSocket.OPEN) {
          terminal.ws.send(JSON.stringify({
            type: 'terminal_resize',
            terminal_id: terminal.id,
            rows: terminal.xterm.rows,
            cols: terminal.xterm.cols
          }))
        }
      }
    }, 50)
  }

  const handleWheelZoom = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey) return
    e.preventDefault()
    const step = e.deltaY < 0 ? 1 : -1
    setFontSize(prev => Math.max(10, Math.min(28, prev + step)))
  }

  const beginRename = (terminalId: string, title: string) => {
    if (clickTimerRef.current) {
      window.clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
    }
    setEditingTerminalId(terminalId)
    setEditingTitle(title)
  }

  const commitRename = (terminalId: string) => {
    const nextTitle = editingTitle.trim()
    if (!nextTitle) {
      setEditingTerminalId(null)
      setEditingTitle('')
      return
    }
    setTerminals(prev => prev.map(t => (t.id === terminalId ? { ...t, title: nextTitle } : t)))
    setEditingTerminalId(null)
    setEditingTitle('')
  }

  const cancelRename = () => {
    setEditingTerminalId(null)
    setEditingTitle('')
  }

  const handleTabClick = (terminalId: string) => {
    if (editingTerminalId === terminalId) return
    if (clickTimerRef.current) {
      window.clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
    }
    clickTimerRef.current = window.setTimeout(() => {
      switchTerminal(terminalId)
      clickTimerRef.current = null
    }, 180)
  }

  const handleTabDoubleClick = (e: React.MouseEvent, terminalId: string, title: string) => {
    e.stopPropagation()
    e.preventDefault()
    if (clickTimerRef.current) {
      window.clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
    }
    beginRename(terminalId, title)
  }

  // 切换沉浸模式
  const toggleImmersive = () => {
    if (!isImmersive) {
      setIsImmersive(true)
      setIsExitingImmersive(false)
      setTimeout(() => {
        const terminal = terminalsRef.current.find(t => t.id === activeTerminalId)
        if (terminal) {
          terminal.fitAddon.fit()
          terminal.xterm.focus()
          if (terminal.ws?.readyState === WebSocket.OPEN) {
            terminal.ws.send(JSON.stringify({
              type: 'terminal_resize',
              terminal_id: terminal.id,
              rows: terminal.xterm.rows,
              cols: terminal.xterm.cols
            }))
          }
        }
      }, 220)
      return
    }

    setIsExitingImmersive(true)
    if (immersiveExitTimerRef.current) {
      window.clearTimeout(immersiveExitTimerRef.current)
    }
    immersiveExitTimerRef.current = window.setTimeout(() => {
      setIsImmersive(false)
      setIsExitingImmersive(false)
      immersiveExitTimerRef.current = null
      const terminal = terminalsRef.current.find(t => t.id === activeTerminalId)
      if (terminal) {
        terminal.fitAddon.fit()
        terminal.xterm.focus()
        if (terminal.ws?.readyState === WebSocket.OPEN) {
          terminal.ws.send(JSON.stringify({
            type: 'terminal_resize',
            terminal_id: terminal.id,
            rows: terminal.xterm.rows,
            cols: terminal.xterm.cols
          }))
        }
      }
    }, 220)
  }

  // 字号变化时，更新所有终端并重算布局
  useEffect(() => {
    terminals.forEach(terminal => {
      terminal.xterm.options.fontSize = fontSize
      terminal.fitAddon.fit()
      if (terminal.ws?.readyState === WebSocket.OPEN) {
        terminal.ws.send(JSON.stringify({
          type: 'terminal_resize',
          terminal_id: terminal.id,
          rows: terminal.xterm.rows,
          cols: terminal.xterm.cols
        }))
      }
    })
  }, [fontSize, terminals])

  // 清理所有终端
  useEffect(() => {
    return () => {
      terminalsRef.current.forEach(terminal => {
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
      if (immersiveExitTimerRef.current) {
        window.clearTimeout(immersiveExitTimerRef.current)
      }
      if (clickTimerRef.current) {
        window.clearTimeout(clickTimerRef.current)
      }
    }
  }, [])

  const showImmersiveShell = isImmersive || isExitingImmersive

  return (
    <div
      className={
        showImmersiveShell
          ? `fixed inset-0 z-50 p-6 bg-black/55 transition-all duration-200 ${isExitingImmersive ? 'opacity-0' : 'opacity-100'}`
          : 'h-full'
      }
    >
      <div className={`flex flex-col h-full rounded-2xl overflow-hidden border shadow-2xl transition-all duration-200 ${
        showImmersiveShell
          ? `bg-gradient-to-br from-black/35 to-black/55 border-white/20 ${isExitingImmersive ? 'scale-[0.985]' : 'scale-100'}`
          : 'bg-gradient-to-br from-black/30 to-black/20 border-white/20'
      }`}>
      {/* 标签栏 */}
      <div className={`flex items-center justify-between border-b ${
        showImmersiveShell
          ? 'px-6 py-4 bg-black/35 backdrop-blur-lg border-white/15'
          : 'px-4 py-3 bg-black/40 backdrop-blur-xl border-white/20'
      }`}>
        <div className="flex items-center gap-2">
          {terminals.map(terminal => (
            <div
              key={terminal.id}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer transition-all duration-200
                ${activeTerminalId === terminal.id
                  ? 'bg-white/20 text-white shadow-lg border border-white/25'
                  : 'bg-white/10 text-white/70 hover:bg-white/15 hover:text-white/90 border border-white/10'
                }
              `}
              onClick={() => handleTabClick(terminal.id)}
              onDoubleClick={(e) => handleTabDoubleClick(e, terminal.id, terminal.title)}
            >
              {editingTerminalId === terminal.id ? (
                <input
                  autoFocus
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onBlur={() => commitRename(terminal.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      commitRename(terminal.id)
                    } else if (e.key === 'Escape') {
                      cancelRename()
                    }
                  }}
                  className="w-[130px] bg-black/30 border border-white/30 rounded px-2 py-0.5 text-sm text-white outline-none"
                />
              ) : (
                <span
                  className="text-sm font-medium"
                  title="慢双击重命名"
                >
                  {terminal.title}
                </span>
              )}
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
        <div className="flex items-center gap-2">
          <span className="px-2 py-1 rounded bg-white/10 text-white/70 text-xs select-none">
            Ctrl+滚轮 字号 {fontSize}
          </span>
          {terminals.length > 0 && (
            <button
              onClick={toggleImmersive}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/15 hover:bg-white/20 text-white/90 hover:text-white transition-all duration-200 border border-white/25 hover:border-white/35 shadow-md"
            >
              {showImmersiveShell ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              <span className="text-sm font-medium">{showImmersiveShell ? '退出全屏' : '全屏'}</span>
            </button>
          )}
        </div>
      </div>

      {/* 终端容器 */}
      <div
        ref={terminalContainerRef}
        onWheel={handleWheelZoom}
        className={`flex-1 relative overflow-hidden ${showImmersiveShell ? 'bg-black/35' : 'bg-black/45'}`}
      >
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
              className={`absolute inset-0 ${showImmersiveShell ? 'px-5 pt-5 pb-8' : 'px-4 pt-4 pb-7'} ${activeTerminalId === terminal.id ? 'block' : 'hidden'}`}
            >
              <div
                id={`terminal-${terminal.id}`}
                className="webshell-terminal h-full w-full"
              />
            </div>
          ))
        )}
      </div>
    </div>
    </div>
  )
}
