function loadScript(url, type = 'module') {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = url
    script.type = type
    script.onload = () => resolve(url)
    script.onerror = () => reject(new Error(`加载失败: ${url}`))
    document.head.appendChild(script)
  })
}

async function getJson(url, options) {
  const res = await fetch(url, options)
  return await res.json()
}

async function getWindowPosFallback() {
  try {
    if (window.pywebview?.api?.get_window_position) {
      const pos = await window.pywebview.api.get_window_position()
      return {
        x: Number(pos?.x || 0),
        y: Number(pos?.y || 0),
      }
    }
  } catch {}
  return {
    x: Number(window.screenX || window.screenLeft || 0),
    y: Number(window.screenY || window.screenTop || 0),
  }
}

function bindAltWindowDrag() {
  const canvas = document.getElementById('live2d')
  if (!canvas) return false
  let dragging = false
  let startMouseX = 0
  let startMouseY = 0
  let startWinX = 0
  let startWinY = 0

  const onMove = async (event) => {
    if (!dragging) return
    const dx = event.screenX - startMouseX
    const dy = event.screenY - startMouseY
    const targetX = Math.round(startWinX + dx)
    const targetY = Math.round(startWinY + dy)
    try {
      if (window.pywebview?.api?.move_window) {
        await window.pywebview.api.move_window(targetX, targetY)
      }
    } catch {}
  }

  const onUp = () => {
    if (!dragging) return
    dragging = false
    window.removeEventListener('mousemove', onMove, true)
    window.removeEventListener('mouseup', onUp, true)
    reportPositionDebounced()
  }

  canvas.addEventListener('mousedown', async (event) => {
    if (event.button !== 0 || !event.altKey) return
    event.preventDefault()
    event.stopPropagation()
    const pos = await getWindowPosFallback()
    startWinX = pos.x
    startWinY = pos.y
    startMouseX = event.screenX
    startMouseY = event.screenY
    dragging = true
    window.addEventListener('mousemove', onMove, true)
    window.addEventListener('mouseup', onUp, true)
  }, true)
  return true
}

function reportPositionDebounced() {
  if (reportPositionDebounced.timer) {
    window.clearTimeout(reportPositionDebounced.timer)
  }
  reportPositionDebounced.timer = window.setTimeout(async () => {
    const x = Math.round(window.screenX || window.screenLeft || 0)
    const y = Math.round(window.screenY || window.screenTop || 0)
    try {
      if (window.pywebview?.api?.report_position) {
        await window.pywebview.api.report_position(x, y)
      } else {
        await fetch('/api/settings/live2d/runtime/position', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ x, y }),
        })
      }
    } catch {}
  }, 180)
}

async function syncSelectedModel(models) {
  const idx = Number.parseInt(localStorage.getItem('modelId') || '0', 10)
  if (!Number.isFinite(idx) || idx < 0 || idx >= models.length) return
  const modelId = models[idx]?.model_id
  if (!modelId) return
  try {
    await fetch('/api/settings/live2d/overlay/settings', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_id: modelId }),
    })
  } catch {}
}

async function main() {
  const [settingsData, modelsData, tipsData] = await Promise.all([
    getJson('/api/settings/live2d/settings', { credentials: 'include' }),
    getJson('/api/settings/live2d/models', { credentials: 'include' }),
    getJson('/api/settings/live2d/widget/tips.json', { credentials: 'include' }),
  ])

  const models = Array.isArray(modelsData?.models) ? modelsData.models : []
  const settings = settingsData?.value || {}
  const selectedIndex = Number.parseInt(String(tipsData?.selected_index ?? 0), 10) || 0
  localStorage.setItem('modelId', String(selectedIndex))
  localStorage.setItem('modelTexturesId', '0')
  let currentScale = Number(settings?.scale ?? 1)
  if (!Number.isFinite(currentScale)) currentScale = 1
  currentScale = Math.max(0.5, Math.min(2.4, currentScale))
  document.documentElement.style.setProperty('--pet-scale', String(currentScale))

  // 避免跨域图片纹理报错（沿用 upstream 逻辑）
  const OriginalImage = window.Image
  window.Image = function (...args) {
    const img = new OriginalImage(...args)
    img.crossOrigin = 'anonymous'
    return img
  }
  window.Image.prototype = OriginalImage.prototype

  await loadScript('/desktop-pet/widget/waifu-tips.js', 'module')
  if (typeof window.initWidget !== 'function') {
    throw new Error('initWidget 未加载')
  }

  window.initWidget({
    waifuPath: '/api/settings/live2d/widget/tips.json',
    cubism2Path: '/desktop-pet/widget/live2d.min.js',
    cubism5Path: '/desktop-pet/vendor/live2dcubismcore.min.js',
    modelId: selectedIndex,
    tools: ['hitokoto', 'asteroids', 'switch-model', 'switch-texture', 'photo', 'info', 'quit'],
    logLevel: 'warn',
    drag: true,
  })

  // 启用眼神跟踪鼠标
  const enableMouseTracking = () => {
    const canvas = document.getElementById('live2d')
    if (!canvas) return false

    canvas.addEventListener('mousemove', (event) => {
      const rect = canvas.getBoundingClientRect()
      const x = (event.clientX - rect.left) / rect.width * 2 - 1
      const y = -(event.clientY - rect.top) / rect.height * 2 + 1

      // 通知Live2D模型更新视线方向
      if (window.Live2D && window.Live2D.setDragging) {
        window.Live2D.setDragging(x, y)
      }
    })

    canvas.addEventListener('mouseleave', () => {
      // 鼠标离开时重置视线
      if (window.Live2D && window.Live2D.setDragging) {
        window.Live2D.setDragging(0, 0)
      }
    })

    return true
  }

  // 等待Live2D加载完成后启用眼神跟踪
  setTimeout(() => {
    if (!enableMouseTracking()) {
      const timer = window.setInterval(() => {
        if (enableMouseTracking()) window.clearInterval(timer)
      }, 200)
    }
  }, 1000)

  // 持久化窗口位置
  window.addEventListener('mouseup', reportPositionDebounced)
  window.addEventListener('pointerup', reportPositionDebounced)

  // 保底拖动：按住 Alt + 左键拖动模型，即移动窗口
  if (!bindAltWindowDrag()) {
    const timer = window.setInterval(() => {
      if (bindAltWindowDrag()) window.clearInterval(timer)
    }, 120)
  }

  // 滚轮缩放（在模型上）
  const bindWheelZoom = () => {
    const canvas = document.getElementById('live2d')
    if (!canvas) return false
    canvas.addEventListener('wheel', (event) => {
      event.preventDefault()
      const delta = event.deltaY > 0 ? -0.06 : 0.06
      currentScale = Math.max(0.5, Math.min(2.4, +(currentScale + delta).toFixed(2)))
      document.documentElement.style.setProperty('--pet-scale', String(currentScale))
      void fetch('/api/settings/live2d/overlay/settings', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scale: currentScale }),
      }).catch(() => {})
    }, { passive: false })
    return true
  }
  if (!bindWheelZoom()) {
    const timer = window.setInterval(() => {
      if (bindWheelZoom()) window.clearInterval(timer)
    }, 120)
  }

  // 切换模型后同步保存到后端
  let lastModelId = localStorage.getItem('modelId') || ''
  window.setInterval(() => {
    const cur = localStorage.getItem('modelId') || ''
    if (cur === lastModelId) return
    lastModelId = cur
    void syncSelectedModel(models)
  }, 500)

  // 同步人格开关等基础设置，避免 overlay 与设置页不一致
  if (typeof settings?.ai_enabled === 'boolean' || settings?.persona) {
    try {
      await fetch('/api/settings/live2d/overlay/settings', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_id: models[selectedIndex]?.model_id || '',
          ai_enabled: settings?.ai_enabled !== false,
          persona: settings?.persona || {},
        }),
      })
    } catch {}
  }
}

void main().catch((err) => {
  console.error('[desktop-pet] init failed', err)
})
