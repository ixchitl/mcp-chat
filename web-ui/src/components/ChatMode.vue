<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { Send, ImageIcon, Copy, Check, Loader2, X, RefreshCw, ArrowDown } from 'lucide-vue-next'
import MarkdownIt from 'markdown-it'
import 'highlight.js/styles/github-dark.min.css'
import { Wrench, FileEdit, Brain, Zap, ChevronDown as ChevDown } from 'lucide-vue-next'
import type { SessionInfo, UpdateEntry } from '../composables/useChat'
import type { Settings } from '../composables/useSettings'

let hljs: typeof import('highlight.js').default | null = null
import('highlight.js').then(m => { hljs = m.default })

interface TraceStep {
  type: string
  content?: string
  file?: string
  lines?: string
  command?: string
  reason?: string
  summary?: string
}

interface TraceData {
  steps: TraceStep[]
  summary?: string
}

interface ChatMessage {
  role: 'ai' | 'user'
  content: string
  ts: number
  model?: string
  images?: string[]
  trace?: TraceData
  updates?: Array<{ status: string; summary: string; detail?: string; tool_name?: string; ts: number }>
}

const props = defineProps<{
  aiMsg: string
  phase: string
  sending: boolean
  sid: string
  sessions: SessionInfo[]
  activeSid: string
  settings: Settings
  submitError: string
  pendingUpdates: UpdateEntry[]
}>()
const emit = defineEmits<{
  submit: [msg: string, images?: string[]]
  switchSession: [sid: string]
  deleteSession: [sid: string]
  deleteProject: [project: string]
}>()

const text = ref('')
const images = ref<string[]>([])
const fileInput = ref<HTMLInputElement | null>(null)
const chatEl = ref<HTMLElement | null>(null)
const textareaEl = ref<HTMLTextAreaElement | null>(null)
const dragging = ref(false)
const lightboxSrc = ref('')
const history = ref<ChatMessage[]>([])
const loadingHistory = ref(false)
const copiedIdx = ref(-1)

// Progress updates panel
const updatesExpanded = ref(true)
function updateIcon(status: string) {
  switch (status) {
    case 'thinking': return Brain
    case 'tool_call': return Wrench
    case 'file_change': return FileEdit
    case 'progress': return Zap
    default: return Wrench
  }
}
function updateIconClass(status: string) {
  switch (status) {
    case 'thinking': return 'text-purple-400'
    case 'tool_call': return 'text-blue-400'
    case 'file_change': return 'text-amber-400'
    case 'progress': return 'text-emerald-400'
    default: return 'text-[--text-muted]'
  }
}

// Thinking indicator with minimum display time + elapsed timer
const showThinking = ref(false)
const thinkingElapsed = ref(0)
let thinkingTimer: ReturnType<typeof setTimeout> | null = null
let thinkingTick: ReturnType<typeof setInterval> | null = null
const MIN_THINKING_MS = 1500
let thinkingStart = 0

function startThinkingTick() {
  stopThinkingTick()
  thinkingStart = Date.now()
  thinkingElapsed.value = 0
  thinkingTick = setInterval(() => {
    thinkingElapsed.value = ((Date.now() - thinkingStart) / 1000)
  }, 100)
}
function stopThinkingTick() {
  if (thinkingTick) { clearInterval(thinkingTick); thinkingTick = null }
}

const thinkingTime = computed(() => {
  const s = thinkingElapsed.value
  return s < 10 ? s.toFixed(1) : Math.round(s).toString()
})

watch(() => props.sending, (val) => {
  if (val) {
    if (thinkingTimer) { clearTimeout(thinkingTimer); thinkingTimer = null }
    showThinking.value = true
    startThinkingTick()
  } else {
    stopThinkingTick()
    const elapsed = Date.now() - thinkingStart
    const remaining = MIN_THINKING_MS - elapsed
    if (remaining > 0) {
      thinkingTimer = setTimeout(() => { showThinking.value = false; thinkingTimer = null }, remaining)
    } else {
      showThinking.value = false
    }
  }
})

const md = new MarkdownIt({
  html: true, linkify: true, typographer: true,
  highlight(str: string, lang: string) {
    if (hljs && lang && hljs.getLanguage(lang)) {
      try { return hljs.highlight(str, { language: lang }).value } catch {}
    }
    return '' // let markdown-it handle escaping
  }
})

function wrapCodeBlocks(html: string): string {
  return html.replace(/<pre><code class="language-([^"]*)">([\s\S]*?)<\/code><\/pre>/g, (_match, lang, code) => {
    const lines = code.split('\n')
    const lineCount = lines[lines.length - 1] === '' ? lines.length - 1 : lines.length
    const isCollapsible = lineCount > 15
    const lineNums = Array.from({ length: lineCount }, (_, i) => `<span class="code-line-num">${i + 1}</span>`).join('')
    return `<div class="code-block-wrapper">`
      + `<div class="code-header">`
      + `<span class="code-lang">${lang}</span>`
      + `<div class="code-header-actions">`
      + (isCollapsible ? `<button class="code-collapse-btn" onclick="this.closest('.code-block-wrapper').classList.toggle('collapsed');this.textContent=this.closest('.code-block-wrapper').classList.contains('collapsed')?'展开':'折叠'">折叠</button>` : '')
      + `<button class="code-copy-btn" onclick="navigator.clipboard.writeText(this.closest('.code-block-wrapper').querySelector('pre code').textContent).then(()=>{this.textContent='✓ 已复制';setTimeout(()=>this.textContent='复制',1500)})">复制</button>`
      + `</div></div>`
      + `<div class="code-body"><div class="code-line-numbers">${lineNums}</div><pre><code>${code}</code></pre></div>`
      + `</div>`
  })
}

function renderMd(content: string): string {
  if (!props.settings.markdown) return `<pre style="white-space:pre-wrap;word-break:break-word;font-family:inherit;margin:0">${content.replace(/</g, '&lt;')}</pre>`
  return wrapCodeBlocks(md.render(content))
}

const currentSession = computed(() => props.sessions.find(s => s.sid === props.sid))
const currentModel = computed(() => currentSession.value?.model || '')
const currentSource = computed(() => currentSession.value?.source || '')

// Derive a display name: model > source-based name > fallback
const sourceNameMap: Record<string, string> = {
  'Windsurf': 'Cascade',
  'Cursor': 'Cursor AI',
  'Copilot': 'GitHub Copilot',
}
const displayName = computed(() => {
  if (currentModel.value) return currentModel.value
  if (currentSource.value) return sourceNameMap[currentSource.value] || currentSource.value
  return 'maile456'
})

// Fetch history when session changes
async function fetchHistory(sid: string) {
  if (!sid) { history.value = []; return }
  loadingHistory.value = true
  try {
    const res = await fetch(`/history?sid=${sid}`)
    const data = await res.json()
    history.value = data.history || []
  } catch {
    history.value = []
  } finally {
    loadingHistory.value = false
  }
}

watch(() => props.sid, (newSid) => {
  fetchHistory(newSid)
}, { immediate: true })

// When aiMsg or phase changes, update history to reflect latest state
watch([() => props.aiMsg, () => props.phase], () => {
  // Re-fetch to keep in sync (lightweight since it's local)
  if (props.sid) fetchHistory(props.sid)
})

// Sticky-follow: only auto-scroll when the user is already near bottom.
// When the user scrolls up, stop forcing view to bottom and surface a jump-down button.
const stickyBottom = ref(true)
const showJumpBtn = ref(false)
const NEAR_BOTTOM_PX = 80

function checkSticky() {
  const el = chatEl.value
  if (!el) return
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight
  stickyBottom.value = distance < NEAR_BOTTOM_PX
  showJumpBtn.value = distance > 160
}

function onScroll() { checkSticky() }

function scrollToBottom(smooth = true) {
  const el = chatEl.value
  if (!el) return
  el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  stickyBottom.value = true
  showJumpBtn.value = false
}

function scrollToMessage(idx: number) {
  const el = chatEl.value
  if (!el) return
  const msgEl = el.querySelector(`[data-msg-idx="${idx}"]`) as HTMLElement
  if (!msgEl) { scrollToBottom(); return }
  const containerRect = el.getBoundingClientRect()
  const msgRect = msgEl.getBoundingClientRect()
  const offset = msgRect.top - containerRect.top + el.scrollTop - 16
  el.scrollTo({ top: offset, behavior: 'smooth' })
}

// Auto-scroll only when sticky AND user recently sent a message
const userJustSent = ref(false)
let userSentTimer: number | null = null

watch(() => history.value.length, async (newLen, oldLen) => {
  if (newLen <= (oldLen || 0)) return
  await nextTick()
  const lastMsg = history.value[newLen - 1]
  // New AI message: scroll to its start so user reads from the top
  if (lastMsg?.role === 'ai' && (userJustSent.value || stickyBottom.value)) {
    scrollToMessage(newLen - 1)
  }
  // User message or other: scroll to bottom
  else if (userJustSent.value || stickyBottom.value) {
    scrollToBottom()
  }
})
watch(() => props.aiMsg, async () => {
  await nextTick()
  // Only scroll during streaming if user just sent or sticky
  if (userJustSent.value && stickyBottom.value) scrollToBottom(false)
})
// When switching session, jump to bottom once
watch(() => props.sid, async () => {
  await nextTick()
  stickyBottom.value = true
  scrollToBottom(false)
})

// Auto-grow textarea
function autoGrow() {
  const el = textareaEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 200) + 'px'
}

function handleSubmit() {
  if (props.sending) return
  if (!text.value.trim() && images.value.length === 0) return
  emit('submit', text.value || '(图片)', images.value.length > 0 ? images.value : undefined)
  text.value = ''
  images.value = []
  // Sending a new message resumes sticky-follow so the user sees their own message + reply
  stickyBottom.value = true
  userJustSent.value = true
  // Clear the flag after AI response completes (wait for phase change)
  if (userSentTimer) clearTimeout(userSentTimer)
  nextTick(() => {
    if (textareaEl.value) textareaEl.value.style.height = ''
    scrollToBottom()
  })
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); handleSubmit() }
}

function onPaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault()
      const file = item.getAsFile()
      if (!file) continue
      const r = new FileReader()
      r.onload = () => images.value.push(r.result as string)
      r.readAsDataURL(file)
    }
  }
}

function onFileChange(e: Event) {
  const files = (e.target as HTMLInputElement).files
  if (!files) return
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue
    const r = new FileReader()
    r.onload = () => images.value.push(r.result as string)
    r.readAsDataURL(f)
  }
  if (fileInput.value) fileInput.value.value = ''
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  if (!e.dataTransfer) return
  for (const f of e.dataTransfer.files) {
    if (!f.type.startsWith('image/')) continue
    const r = new FileReader()
    r.onload = () => images.value.push(r.result as string)
    r.readAsDataURL(f)
  }
}

function removeImage(i: number) { images.value.splice(i, 1) }

function copyMsg(idx: number, content: string) {
  navigator.clipboard.writeText(content).then(() => {
    copiedIdx.value = idx
    setTimeout(() => { copiedIdx.value = -1 }, 2000)
  }).catch(() => {})
}

function traceIcon(type: string): string {
  const icons: Record<string, string> = {
    thinking: '💭',
    read_file: '📂',
    shell: '⚡',
    search: '🔍',
    decision: '💡',
    file_change: '✏️',
    verification: '✅',
    error: '❌',
  }
  return icons[type] || '•'
}

function openLightbox(src: string) { lightboxSrc.value = src }
function closeLightbox() { lightboxSrc.value = '' }
function onEscKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && lightboxSrc.value) { closeLightbox(); e.preventDefault() }
}

// Focus textarea when user's turn & reset userJustSent flag
let lastPhase = ''
watch(() => props.phase, (p) => {
  if (p === 'waiting_for_user' && lastPhase !== 'waiting_for_user') {
    nextTick(() => textareaEl.value?.focus())
    // AI finished responding, stop auto-scrolling
    if (userSentTimer) clearTimeout(userSentTimer)
    userSentTimer = window.setTimeout(() => {
      userJustSent.value = false
    }, 500)
  }
  lastPhase = p
})

onMounted(() => {
  lastPhase = props.phase
  document.addEventListener('keydown', onEscKey)
})
onUnmounted(() => {
  document.removeEventListener('keydown', onEscKey)
})
</script>

<template>
  <div class="flex-1 flex flex-col min-w-0 overflow-hidden">
    <!-- Chat messages (inner) -->
    <div ref="chatEl" @scroll.passive="onScroll" class="flex-1 overflow-y-auto relative">
      <div class="max-w-[48rem] mx-auto px-6 pt-4 pb-6">
        <!-- Empty state: only show when truly idle with no history -->
        <div v-if="history.length === 0 && !loadingHistory && phase === 'idle'" class="flex flex-col items-start justify-end py-32 select-none max-w-[48rem]">
          <div class="text-[--text-muted] text-lg mb-2 font-normal tracking-wide">Hi {{ settings.username || 'maile456' }}</div>
          <div class="text-[--text-primary] text-4xl font-light tracking-tight">Where should we start?</div>
        </div>

        <!-- Loading -->
        <div v-if="loadingHistory" class="flex justify-center py-12">
          <Loader2 :size="24" class="animate-spin text-[--text-dim]" />
        </div>

        <!-- Messages -->
        <template v-for="(msg, idx) in history" :key="idx">
          <!-- AI message -->
          <div v-if="msg.role === 'ai'" :data-msg-idx="idx" class="mb-8 msg-animate">
            <div class="flex items-center gap-3 mb-3">
              <img src="/avatar.png" alt="" class="w-8 h-8 rounded-full object-cover" />
              <div class="text-sm font-medium text-[--text-primary]">{{ msg.model || displayName }}</div>
            </div>
            <div class="pl-11">
              <!-- Trace: collapsible work steps -->
              <details v-if="msg.trace && msg.trace.steps && msg.trace.steps.length" class="mb-3 group">
                <summary class="cursor-pointer select-none text-xs text-[--text-muted] hover:text-[--text-secondary] transition-colors flex items-center gap-1.5 py-1">
                  <span class="inline-block transition-transform group-open:rotate-90">▶</span>
                  <span>🧠 工作流程 ({{ msg.trace.steps.length }} 步)</span>
                  <span v-if="msg.trace.summary" class="text-[--text-dim] ml-1">— {{ msg.trace.summary }}</span>
                </summary>
                <div class="mt-2 ml-1 pl-3 border-l-2 border-[--border-color] space-y-1.5">
                  <div v-for="(step, si) in msg.trace.steps" :key="si" class="text-xs text-[--text-muted] flex items-start gap-2 leading-relaxed">
                    <span class="shrink-0 mt-0.5">{{ traceIcon(step.type) }}</span>
                    <span>
                      <span v-if="step.type === 'thinking'" class="text-[--text-secondary]">{{ step.content || step.summary }}</span>
                      <span v-else-if="step.type === 'read_file'">
                        <template v-if="step.file"><code class="text-[10px] px-1 py-0.5 rounded bg-[--inline-code-bg]">{{ step.file }}</code><span v-if="step.lines" class="text-[--text-dim]"> L{{ step.lines }}</span><span v-if="step.reason" class="text-[--text-dim]"> — {{ step.reason }}</span></template>
                        <span v-else class="text-[--text-secondary]">{{ step.content || step.summary || step.reason }}</span>
                      </span>
                      <span v-else-if="step.type === 'shell'">
                        <template v-if="step.command"><code class="text-[10px] px-1 py-0.5 rounded bg-[--inline-code-bg]">{{ step.command }}</code><span v-if="step.reason" class="text-[--text-dim]"> — {{ step.reason }}</span></template>
                        <span v-else class="text-[--text-secondary]">{{ step.content || step.summary || step.reason }}</span>
                      </span>
                      <span v-else-if="step.type === 'search'"><span class="text-[--text-secondary]">{{ step.content || step.summary }}</span></span>
                      <span v-else-if="step.type === 'decision'" class="text-[--accent]">{{ step.content || step.summary }}</span>
                      <span v-else-if="step.type === 'file_change'">
                        <template v-if="step.file"><code class="text-[10px] px-1 py-0.5 rounded bg-[--inline-code-bg]">{{ step.file }}</code> <span class="text-[--text-dim]">{{ step.summary || step.content }}</span></template>
                        <span v-else class="text-[--text-secondary]">{{ step.content || step.summary || step.reason }}</span>
                      </span>
                      <span v-else-if="step.type === 'verification'" class="text-emerald-400">{{ step.content || step.summary }}</span>
                      <span v-else-if="step.type === 'error'" class="text-red-400">{{ step.content || step.summary }}</span>
                      <span v-else class="text-[--text-secondary]">{{ step.content || step.summary || step.reason }}</span>
                    </span>
                  </div>
                </div>
              </details>
              <div class="md-body" :style="{ fontSize: (settings.fontSize || 16) + 'px' }" v-html="renderMd(msg.content)" />
              <div class="flex items-center gap-1 mt-3">
                <button @click="copyMsg(idx, msg.content)" class="h-7 px-2.5 flex items-center gap-1.5 rounded-full text-xs hover:bg-[--bg-hover] transition-colors" :class="copiedIdx === idx ? 'text-blue-400' : 'text-[--text-muted]'">
                  <component :is="copiedIdx === idx ? Check : Copy" :size="14" />
                  <span>{{ copiedIdx === idx ? '已复制' : '复制' }}</span>
                </button>
              </div>
            </div>
          </div>

          <!-- User message -->
          <div v-else :data-msg-idx="idx" class="mb-8 flex justify-end gap-3 msg-animate">
            <div class="max-w-[80%] bg-[--user-bubble] rounded-2xl rounded-br-md px-5 py-3.5">
              <div v-if="msg.images && msg.images.length" class="flex gap-2 flex-wrap mb-2">
                <img v-for="(img, ii) in msg.images" :key="ii" :src="img" class="max-w-[200px] max-h-[200px] object-cover rounded-lg cursor-zoom-in" @click.stop="openLightbox(img)" />
              </div>
              <div v-if="msg.content" class="text-[15px] text-[--text-primary] leading-relaxed whitespace-pre-wrap break-words">{{ msg.content }}</div>
            </div>
            <img src="/user.jpg" alt="用户" class="w-8 h-8 rounded-full object-cover shrink-0 mt-0.5" />
          </div>
        </template>

        <!-- Thinking indicator + progress panel -->
        <Transition name="thinking-fade">
        <div v-if="showThinking" class="mb-8">
          <div class="flex items-start gap-3">
            <img src="/avatar.png" alt="" class="w-8 h-8 rounded-full object-cover shrink-0 mt-0.5" />
            <div class="flex flex-col gap-1.5 pt-1 flex-1 min-w-0">
              <div class="flex items-center gap-2.5">
                <div class="thinking-breathe">
                  <span></span><span></span><span></span>
                </div>
                <span class="thinking-text">{{ pendingUpdates.length > 0 ? (pendingUpdates[pendingUpdates.length - 1].summary || '处理中') : '思考中' }}</span>
              </div>
              <span class="text-[11px] text-[--text-dim] tabular-nums pl-[30px]">{{ thinkingTime }}s</span>

              <!-- Progress updates timeline -->
              <div v-if="pendingUpdates.length > 0" class="mt-2 ml-1">
                <button @click="updatesExpanded = !updatesExpanded" class="flex items-center gap-1.5 text-xs text-[--text-muted] hover:text-[--text-secondary] transition-colors mb-1.5">
                  <ChevDown :size="12" class="transition-transform" :class="updatesExpanded ? '' : '-rotate-90'" />
                  <span>{{ pendingUpdates.length }} 步操作</span>
                </button>
                <div v-show="updatesExpanded" class="space-y-1 border-l-2 border-[--border-color] pl-3 ml-1">
                  <div v-for="(upd, i) in pendingUpdates" :key="i" class="flex items-start gap-2 text-xs msg-animate" :style="{ animationDelay: i * 50 + 'ms' }">
                    <component :is="updateIcon(upd.status)" :size="13" class="shrink-0 mt-0.5" :class="updateIconClass(upd.status)" />
                    <div class="min-w-0 flex-1">
                      <span class="text-[--text-secondary]">{{ upd.summary || upd.status }}</span>
                      <span v-if="upd.tool_name" class="ml-1.5 px-1.5 py-px rounded text-[10px] bg-[--accent-bg] text-[--accent]">{{ upd.tool_name }}</span>
                      <div v-if="upd.detail" class="mt-0.5 text-[10px] text-[--text-dim] truncate max-w-[400px]" :title="upd.detail">{{ upd.detail }}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        </Transition>
      </div>

      <!-- Jump to bottom pill -->
      <Transition name="jump-fade">
        <button
          v-if="showJumpBtn"
          @click="scrollToBottom()"
          class="jump-btn absolute left-1/2 -translate-x-1/2 bottom-4 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[--bg-tertiary] border border-[--border-color] text-[--text-primary] text-xs shadow-lg hover:bg-[--bg-hover] transition-colors"
        >
          <ArrowDown :size="14" />
          <span>回到底部</span>
        </button>
      </Transition>
    </div>

    <!-- Composer -->
    <div class="shrink-0 px-6 pb-4 pt-1">
      <div class="gemini-composer max-w-[48rem] mx-auto" :class="phase === 'waiting_for_user' ? 'ring-1 ring-blue-500/25' : ''">
        <!-- Image previews -->
        <div v-if="images.length" class="flex gap-2 px-5 pt-4 flex-wrap">
          <div v-for="(img, i) in images" :key="i" class="relative group">
            <img :src="img" class="w-12 h-12 object-cover rounded-lg cursor-zoom-in" @click.stop="openLightbox(img)" />
            <button @click.stop="removeImage(i)" class="absolute -top-1.5 -right-1.5 w-5 h-5 bg-zinc-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500">
              <X :size="10" class="text-white" />
            </button>
          </div>
        </div>
        <!-- Textarea -->
        <div class="px-5 pt-4"
          @dragover.prevent="dragging = true"
          @dragleave="dragging = false"
          @drop="(e: DragEvent) => { dragging = false; onDrop(e) }"
        >
          <textarea
            ref="textareaEl"
            v-model="text"
            @keydown="onKeydown"
            @paste="onPaste"
            @input="autoGrow"
            :disabled="sending"
            rows="1"
            :placeholder="phase === 'waiting_for_user' ? '输入你的回复...' : '给 maile456 发消息'"
            class="w-full min-h-[32px] max-h-[200px] bg-transparent text-base text-[--text-primary] placeholder:text-[--text-dim] resize-none focus:outline-none disabled:opacity-30 leading-relaxed"
          />
        </div>
        <!-- Bottom row -->
        <div class="flex items-center justify-between px-3 pb-3 pt-1">
          <div class="flex items-center gap-1">
            <button @click="fileInput?.click()" class="w-10 h-10 flex items-center justify-center rounded-full text-[--text-muted] hover:text-[--text-primary] hover:bg-[--bg-hover] transition-all" title="上传图片">
              <ImageIcon :size="20" />
            </button>
            <input ref="fileInput" type="file" accept="image/*" multiple class="hidden" @change="onFileChange" />
          </div>
          <button
            @click="handleSubmit"
            :disabled="sending || (!text.trim() && images.length === 0)"
            class="w-10 h-10 flex items-center justify-center rounded-full transition-all"
            :class="sending ? 'text-[--text-dim] cursor-not-allowed' : (text.trim() || images.length > 0) ? 'bg-[--text-primary] text-[--bg-primary] hover:bg-white' : 'text-[--text-dim] cursor-not-allowed'"
          >
            <Loader2 v-if="sending" :size="20" class="animate-spin" />
            <Send v-else :size="20" />
          </button>
        </div>
        <!-- Error -->
        <Transition name="tab-fade">
          <div v-if="submitError" class="text-xs text-red-400 px-5 pb-3 text-center">{{ submitError }}</div>
        </Transition>
      </div>
      <div class="text-center mt-2">
        <span class="text-xs text-[--text-dim]">Enter 发送 · Shift+Enter 换行</span>
      </div>
    </div>

    <!-- Lightbox -->
    <Teleport to="body">
      <Transition name="tab-fade">
        <div v-if="lightboxSrc" @click="closeLightbox" class="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-8 cursor-zoom-out">
          <img :src="lightboxSrc" class="max-w-full max-h-full rounded-2xl shadow-2xl object-contain" />
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
