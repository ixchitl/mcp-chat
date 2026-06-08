import { ref, computed, watch, onMounted, onUnmounted } from 'vue'

export interface SessionInfo {
  sid: string
  phase: string
  msg_id: number
  preview: string
  created: number
  updated?: number
  source?: string
  project?: string
  model?: string
  msg_count?: number
  alive?: boolean
}

export interface UpdateEntry {
  status: string    // 'thinking' | 'tool_call' | 'file_change' | 'progress'
  summary: string
  detail?: string
  tool_name?: string
  ts: number
}

export function useChat() {
  const aiMsg = ref('')
  const phase = ref('idle')
  const msgId = ref(0)
  const sid = ref('')
  const sending = ref(false)
  const connected = ref(false)
  const sessions = ref<SessionInfo[]>([])
  const activeSid = ref('')
  const lastActivity = ref(Date.now())
  const wsLatency = ref(-1)          // ms, -1 = unknown
  const submitError = ref('')
  const pendingUpdates = ref<UpdateEntry[]>([])
  const readCounts = ref<Record<string, number>>({})
  let initialLoad = true

  let ws: WebSocket | null = null
  let reconnectTimer: number | null = null
  let pollTimer: number | null = null
  let pingTimer: number | null = null
  let mid = 0
  let lastTs = 0                      // server timestamp for dedup
  let serverVersion = 0               // for long-poll change detection
  let reconnectDelay = 1000
  let pingSentAt = 0
  let pollAbort: AbortController | null = null
  let manualSwitchAt = 0             // timestamp of last manual session switch
  const MAX_RECONNECT = 15000
  const origTitle = 'chat-maile456'

  // --- Browser tab title ---
  function updateTitle() {
    if (typeof document === 'undefined') return
    document.title = origTitle
  }

  function applyState(data: { ai_msg: string; phase: string; msg_id: number; sid?: string; ts?: number; pending_updates?: UpdateEntry[] }) {
    // Ignore state for a different session
    if (data.sid && sid.value && data.sid !== sid.value) return
    // Timestamp dedup: skip stale data
    if (data.ts && data.ts < lastTs) return
    if (data.ts) lastTs = data.ts

    if (data.sid) sid.value = data.sid
    // Always accept content after a session switch (mid===0) or when there's actual content.
    // Only skip blank updates for the *current* session to avoid flash during continuous chat.
    if (data.ai_msg || data.phase === 'waiting_for_user' || mid === 0) {
      aiMsg.value = data.ai_msg
    }
    // Update pending_updates for real-time progress display
    if (data.pending_updates) {
      pendingUpdates.value = data.pending_updates
    }
    // Clear pending updates when AI finishes (phase transitions to waiting_for_user)
    if (data.phase === 'waiting_for_user') {
      pendingUpdates.value = []
    }
    phase.value = data.phase
    msgId.value = data.msg_id
    lastActivity.value = Date.now()
    if (data.msg_id > mid) {
      mid = data.msg_id
      if (data.phase === 'waiting_for_user') {
        sending.value = false
      }
    }
    if (data.phase === 'waiting_for_ai' && !sending.value) {
      sending.value = true
    }
  }

  function applySessionsList(data: { sessions: SessionInfo[]; active_sid: string }) {
    sessions.value = data.sessions
    activeSid.value = data.active_sid

    // Unread tracking
    if (initialLoad) {
      // First load: mark all existing sessions as read
      for (const s of data.sessions) {
        readCounts.value[s.sid] = s.msg_count || 0
      }
      initialLoad = false
    } else {
      // Subsequent updates: only init new sessions (unseen = unread)
      for (const s of data.sessions) {
        if (!(s.sid in readCounts.value)) {
          readCounts.value[s.sid] = 0
        }
      }
    }
    // Always mark current session as read
    if (sid.value) {
      const cur = data.sessions.find(s => s.sid === sid.value)
      if (cur) readCounts.value[sid.value] = cur.msg_count || 0
    }
    // Clean up deleted sessions
    for (const key of Object.keys(readCounts.value)) {
      if (!data.sessions.find(s => s.sid === key)) {
        delete readCounts.value[key]
      }
    }

    // Auto-join newest active session only if we have no session at all
    if (!sid.value && data.active_sid) {
      doSwitch(data.active_sid)
      return
    }

    // Re-join current session if phase changed to waiting_for_ai
    // This ensures we receive stream_update broadcasts via _broadcast_state
    if (sid.value) {
      const cur = data.sessions.find(s => s.sid === sid.value)
      if (cur && cur.phase === 'waiting_for_ai' && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'join', sid: sid.value }))
      }
    }

    // 不再自动跳转到新会话，用户手动切换
    updateTitle()
  }

  // --- WebSocket ---
  function connectWs() {
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return
    const wsUrl = `ws://${window.location.hostname}:8081`
    try {
      ws = new WebSocket(wsUrl)
    } catch {
      startPolling()
      return
    }

    ws.onopen = () => {
      connected.value = true
      reconnectDelay = 1000
      wsLatency.value = -1
      stopPolling()
      startPing()
      ws!.send(JSON.stringify({ type: 'join', sid: sid.value || '' }))
    }
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type === 'pong') {
          if (pingSentAt > 0) wsLatency.value = Date.now() - pingSentAt
        } else if (data.type === 'sessions') {
          applySessionsList(data)
        } else if (data.type === 'ack') {
          // Submit acknowledged by server
          submitError.value = ''
        } else if (data.error) {
          // Server error (no_session, invalid_submit) — reset sending state
          if (sending.value) {
            sending.value = false
            phase.value = 'waiting_for_user'
            submitError.value = data.error === 'no_session' ? '会话不存在' : (data.error || '提交失败')
          }
        } else if (data.ai_msg !== undefined) {
          applyState(data)
        }
      } catch { /* ignore */ }
    }
    ws.onclose = () => {
      connected.value = false
      wsLatency.value = -1
      ws = null
      stopPing()
      scheduleReconnect()
    }
    ws.onerror = () => {
      connected.value = false
      ws?.close()
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) return
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null
      connectWs()
    }, reconnectDelay)
    reconnectDelay = Math.min(reconnectDelay * 1.5, MAX_RECONNECT)
    startPolling()
  }

  // --- WS ping keepalive with latency tracking ---
  function startPing() {
    stopPing()
    pingTimer = window.setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        pingSentAt = Date.now()
        ws.send('{"type":"ping"}')
      }
    }, 30000)
  }
  function stopPing() {
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null }
  }

  // --- Polling fallback: long-poll with version tracking ---
  async function fetchPoll(useLongPoll = false) {
    if (pollAbort) { pollAbort.abort(); pollAbort = null }
    pollAbort = new AbortController()
    try {
      let url = sid.value ? `/poll?sid=${sid.value}` : '/poll'
      if (useLongPoll && serverVersion > 0) url += `${url.includes('?') ? '&' : '?'}v=${serverVersion}`
      const res = await fetch(url, { signal: pollAbort.signal })
      if (res.status === 304) return  // no change
      const data = await res.json()
      if (data.v) serverVersion = data.v
      if (data.state) applyState(data.state)
      if (data.sessions) applySessionsList(data)
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      /* network error — ignore */
    } finally {
      pollAbort = null
    }
  }

  function startPolling() {
    if (pollTimer) return
    const tick = async () => {
      const useLong = !document.hidden  // long-poll only when tab is visible
      await fetchPoll(useLong)
      // If long-poll returned quickly (data changed), poll again immediately
      // If hidden, use fixed interval
      const nextInterval = document.hidden ? 5000 : 200
      pollTimer = window.setTimeout(tick, nextInterval)
    }
    pollTimer = window.setTimeout(tick, 300)
  }

  function stopPolling() {
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null }
    if (pollAbort) { pollAbort.abort(); pollAbort = null }
  }

  // --- Visibility change: reconnect immediately when tab becomes visible ---
  function onVisibility() {
    if (!document.hidden && !connected.value) {
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
      reconnectDelay = 1000
      connectWs()
    }
    // Refresh data immediately when tab becomes visible
    if (!document.hidden && connected.value) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'list_sessions' }))
      }
    }
  }

  // --- Session switching ---
  function doSwitch(newSid: string) {
    if (newSid === sid.value) return
    sid.value = newSid
    mid = 0
    lastTs = 0
    sending.value = false
    msgId.value = 0

    // Populate from session list preview to avoid blank flash
    const info = sessions.value.find(s => s.sid === newSid)
    if (info) {
      phase.value = info.phase
    } else {
      aiMsg.value = ''
      phase.value = 'idle'
    }

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'join', sid: newSid }))
    } else {
      fetchPoll()
    }
  }

  // Public: called from UI (manual switch, sets cooldown)
  function switchSession(newSid: string) {
    manualSwitchAt = Date.now()
    // Mark target session as read
    const target = sessions.value.find(s => s.sid === newSid)
    if (target) readCounts.value[newSid] = target.msg_count || 0
    doSwitch(newSid)
  }

  // --- Delete session ---
  async function deleteSession(delSid: string) {
    // If deleting the current session, switch away first
    if (delSid === sid.value) {
      const other = sessions.value.find(s => s.sid !== delSid)
      if (other) switchSession(other.sid)
      else { sid.value = ''; aiMsg.value = ''; phase.value = 'idle'; msgId.value = 0 }
    }
    try {
      const res = await fetch('/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sid: delSid }),
      })
      const data = await res.json()
      if (data.ok) {
        sessions.value = sessions.value.filter(s => s.sid !== delSid)
        updateTitle()
      }
    } catch { /* ignore */ }
  }

  // --- Delete project ---
  async function deleteProject(project: string) {
    // If current session is in this project, switch away
    const currentSession = sessions.value.find(s => s.sid === sid.value)
    if (currentSession && (currentSession.project || '(default)') === project) {
      const other = sessions.value.find(s => (s.project || '(default)') !== project)
      if (other) switchSession(other.sid)
      else { sid.value = ''; aiMsg.value = ''; phase.value = 'idle'; msgId.value = 0 }
    }
    try {
      const res = await fetch('/delete-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project }),
      })
      const data = await res.json()
      if (data.ok) {
        sessions.value = sessions.value.filter(s => (s.project || '(default)') !== project)
        updateTitle()
      }
    } catch { /* ignore */ }
  }

  // --- Submit ---
  function sendViaHttp(message: string, images?: string[]) {
    fetch('/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response: message, sid: sid.value, ...(images && images.length > 0 ? { images } : {}) }),
    }).then(async (res) => {
      const data = await res.json()
      if (data.ok && data.ai_msg !== undefined) {
        applyState(data)
      } else if (!data.ok) {
        sending.value = false
        phase.value = 'waiting_for_user'
        submitError.value = data.error || '提交失败'
      }
    }).catch(() => {
      sending.value = false
      phase.value = 'waiting_for_user'
      submitError.value = '网络错误'
    })
  }

  function submit(message: string, images?: string[]) {
    if (!message.trim()) return
    submitError.value = ''

    // Optimistic UI: immediately show sending state
    sending.value = true
    phase.value = 'waiting_for_ai'

    // For large payloads (images), prefer HTTP to avoid WS frame issues
    const hasImages = images && images.length > 0

    if (!hasImages && ws && ws.readyState === WebSocket.OPEN) {
      try {
        const payload: Record<string, unknown> = { type: 'submit', response: message, sid: sid.value }
        ws.send(JSON.stringify(payload))
      } catch {
        // WS send failed, fall back to HTTP
        sendViaHttp(message)
      }
    } else {
      // Always use HTTP for image uploads (more reliable for large payloads)
      sendViaHttp(message, images)
    }
  }

  // Watch phase for title updates
  watch(phase, updateTitle)

  onMounted(async () => {
    document.addEventListener('visibilitychange', onVisibility)
    await fetchPoll()
    mid = msgId.value
    connectWs()
  })

  onUnmounted(() => {
    document.removeEventListener('visibilitychange', onVisibility)
    stopPolling()
    stopPing()
    if (reconnectTimer) clearTimeout(reconnectTimer)
    if (ws) ws.close()
    document.title = origTitle
  })

  const unreadSids = computed(() => {
    return new Set(
      sessions.value
        .filter(s => (s.msg_count || 0) > (readCounts.value[s.sid] || 0))
        .map(s => s.sid)
    )
  })

  return { aiMsg, phase, msgId, sid, sending, connected, sessions, activeSid, lastActivity, wsLatency, submitError, pendingUpdates, unreadSids, submit, switchSession, deleteSession, deleteProject }
}
