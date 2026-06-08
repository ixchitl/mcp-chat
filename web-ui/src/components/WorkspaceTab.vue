<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { Send, ImageIcon, Copy, Check, Loader2, X, MessageSquare, Clock, ChevronLeft, ChevronRight, Trash2, Filter, FolderOpen, ChevronDown, Search } from 'lucide-vue-next'
import MarkdownIt from 'markdown-it'
import 'highlight.js/styles/github-dark.min.css'
import type { SessionInfo } from '../composables/useChat'
import type { Settings } from '../composables/useSettings'

// Lazy-load highlight.js for faster initial render
let hljs: typeof import('highlight.js').default | null = null
import('highlight.js').then(m => { hljs = m.default })

const props = defineProps<{
  mode?: 'sidebar' | 'main'
  aiMsg: string
  phase: string
  sending: boolean
  sid: string
  sessions: SessionInfo[]
  activeSid: string
  settings: Settings
  submitError: string
  unreadSids?: Set<string>
}>()
const emit = defineEmits<{
  submit: [msg: string, images?: string[]]
  switchSession: [sid: string]
  deleteSession: [sid: string]
  deleteProject: [project: string]
}>()

const text = ref('')
const images = ref<string[]>([])
const sessionDrafts = ref<Map<string, { text: string; images: string[] }>>(new Map())
const fileInput = ref<HTMLInputElement | null>(null)
const aiEl = ref<HTMLElement | null>(null)
const textareaEl = ref<HTMLTextAreaElement | null>(null)
const copied = ref(false)
const sourceFilter = ref('')
const projectFilter = ref('')
const searchQuery = ref('')
const dragging = ref(false)
const showScrollTop = ref(false)
const lightboxSrc = ref('')
const cleaning = ref(false)
const cleanedMsg = ref('')

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
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

const renderedHtml = computed(() => {
  if (!props.aiMsg) return ''
  if (!props.settings.markdown) return `<pre style="white-space:pre-wrap;word-break:break-word;font-family:inherit;margin:0">${props.aiMsg.replace(/</g,'&lt;')}</pre>`
  return wrapCodeBlocks(md.render(props.aiMsg))
})

const statusConfig = computed(() => {
  if (props.phase === 'waiting_for_user') return { text: '等待回复', color: 'text-emerald-400', dot: 'bg-emerald-500' }
  if (props.phase === 'waiting_for_ai') return { text: '处理中', color: 'text-amber-400', dot: 'bg-amber-500 animate-pulse' }
  return { text: '空闲', color: 'text-dark-muted', dot: 'bg-zinc-600' }
})

const charCount = computed(() => text.value.length)

// Session navigation: prev/next through sessions list
const currentSessionIndex = computed(() => {
  if (!props.sid || props.sessions.length === 0) return -1
  return props.sessions.findIndex(s => s.sid === props.sid)
})
const canGoPrev = computed(() => currentSessionIndex.value > 0)
const canGoNext = computed(() => currentSessionIndex.value >= 0 && currentSessionIndex.value < props.sessions.length - 1)
const isLatest = computed(() => currentSessionIndex.value === props.sessions.length - 1)
function goPrev() {
  if (!canGoPrev.value) return
  emit('switchSession', props.sessions[currentSessionIndex.value - 1].sid)
}
function goNext() {
  if (!canGoNext.value) return
  emit('switchSession', props.sessions[currentSessionIndex.value + 1].sid)
}
function goLatest() {
  if (props.sessions.length === 0) return
  emit('switchSession', props.sessions[props.sessions.length - 1].sid)
}

// Save/restore draft text per session
watch(() => props.sid, (newSid, oldSid) => {
  if (oldSid) {
    sessionDrafts.value.set(oldSid, { text: text.value, images: [...images.value] })
  }
  if (newSid) {
    const draft = sessionDrafts.value.get(newSid)
    if (draft) {
      text.value = draft.text
      images.value = [...draft.images]
    } else {
      text.value = ''
      images.value = []
    }
    nextTick(() => autoGrow())
  }
})

// Source management
const sourceColors: Record<string, string> = {
  'Windsurf': 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  'Cursor': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'Copilot': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'IDE': 'bg-gray-500/20 text-gray-400 border-gray-500/30',
}
function sourceClass(src?: string) {
  return sourceColors[src || ''] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'
}
const uniqueSources = computed(() => {
  const s = new Set(props.sessions.map(s => s.source || 'IDE'))
  return [...s].sort()
})
const filteredSessions = computed(() => {
  let list = props.sessions
  if (sourceFilter.value) list = list.filter(s => (s.source || 'IDE') === sourceFilter.value)
  if (projectFilter.value) list = list.filter(s => (s.project || '(default)') === projectFilter.value)
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase()
    list = list.filter(s =>
      (s.preview || '').toLowerCase().includes(query) ||
      (s.project || '').toLowerCase().includes(query) ||
      (s.source || '').toLowerCase().includes(query) ||
      (s.model || '').toLowerCase().includes(query)
    )
  }
  return list
})

interface TimeGroup {
  label: string
  sessions: typeof props.sessions
}
const timeGroupedSessions = computed<TimeGroup[]>(() => {
  const groups: TimeGroup[] = []
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1)
  const weekStart = new Date(todayStart); weekStart.setDate(weekStart.getDate() - 7)

  const today: typeof props.sessions = []
  const yesterday: typeof props.sessions = []
  const thisWeek: typeof props.sessions = []
  const older: typeof props.sessions = []

  for (const s of filteredSessions.value) {
    const ts = (s.updated || s.created) * 1000
    if (ts >= todayStart.getTime()) today.push(s)
    else if (ts >= yesterdayStart.getTime()) yesterday.push(s)
    else if (ts >= weekStart.getTime()) thisWeek.push(s)
    else older.push(s)
  }

  if (today.length) groups.push({ label: '今天', sessions: today })
  if (yesterday.length) groups.push({ label: '昨天', sessions: yesterday })
  if (thisWeek.length) groups.push({ label: '本周', sessions: thisWeek })
  if (older.length) groups.push({ label: '更早', sessions: older })
  return groups
})
const currentSource = computed(() => {
  const s = props.sessions.find(s => s.sid === props.sid)
  return s?.source || ''
})
const currentProject = computed(() => {
  const s = props.sessions.find(s => s.sid === props.sid)
  return s?.project || ''
})
const currentModel = computed(() => {
  const s = props.sessions.find(s => s.sid === props.sid)
  return s?.model || ''
})

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

// Project grouping
interface ProjectGroup {
  project: string
  sessions: typeof props.sessions
  waiting: number
}
const projectGroups = computed<ProjectGroup[]>(() => {
  const map = new Map<string, typeof props.sessions>()
  for (const s of filteredSessions.value) {
    const p = s.project || '(default)'
    if (!map.has(p)) map.set(p, [])
    map.get(p)!.push(s)
  }
  const groups: ProjectGroup[] = []
  for (const [project, sessions] of map) {
    groups.push({ project, sessions, waiting: sessions.filter(s => s.phase === 'waiting_for_user').length })
  }
  return groups
})
const uniqueProjects = computed(() => {
  const p = new Set(props.sessions.map(s => s.project || '(default)'))
  return [...p].sort()
})
const hasMultipleProjects = computed(() => uniqueProjects.value.length > 1)
const collapsedProjects = ref<Set<string>>(new Set())
function toggleProject(p: string) {
  if (collapsedProjects.value.has(p)) collapsedProjects.value.delete(p)
  else collapsedProjects.value.add(p)
}

function phaseLabel(p: string) {
  if (p === 'waiting_for_user') return '待回复'
  if (p === 'waiting_for_ai') return '处理中'
  return '空闲'
}

// Live-updating relative time
const now = ref(Date.now())
let relTimer: number
function thinkingTime(updated?: number) {
  if (!updated) return '0s'
  const s = Math.max(0, (now.value / 1000) - updated)
  return s < 10 ? s.toFixed(1) + 's' : Math.round(s) + 's'
}
function relTime(ts: number) {
  const diff = (now.value / 1000) - ts
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`
  return `${Math.floor(diff / 86400)}天前`
}

// Auto-scroll on new AI message
watch(() => props.aiMsg, async () => {
  await nextTick()
  if (aiEl.value) aiEl.value.scrollTo({ top: aiEl.value.scrollHeight, behavior: 'smooth' })
})

// Play notification sound when AI posts new message
let lastPhase = ''
watch(() => props.phase, (p) => {
  if (p === 'waiting_for_user' && lastPhase !== 'waiting_for_user') {
    if (props.settings.notifySound && props.settings.volume > 0) {
      try {
        const ctx = new AudioContext()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain).connect(ctx.destination)
        osc.frequency.value = 800
        const vol = Math.max(0.001, (props.settings.volume / 100) * 0.15)
        gain.gain.value = vol
        osc.start()
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
        osc.stop(ctx.currentTime + 0.3)
      } catch {}
    }
    // Focus textarea
    nextTick(() => textareaEl.value?.focus())
  }
  lastPhase = p
})

// Scroll-to-top visibility
function onAiScroll() {
  if (!aiEl.value) return
  showScrollTop.value = aiEl.value.scrollTop > 300
}
function scrollToTop() {
  aiEl.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

// Image lightbox
function openLightbox(src: string) { lightboxSrc.value = src }
function closeLightbox() { lightboxSrc.value = '' }

// Escape closes lightbox
function onEscKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && lightboxSrc.value) { closeLightbox(); e.preventDefault() }
}

// Auto-grow textarea
function autoGrow() {
  const el = textareaEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 400) + 'px'
}

function handleSubmit() {
  if (props.sending) return
  if (!text.value.trim() && images.value.length === 0) return
  emit('submit', text.value || '(图片)', images.value.length > 0 ? images.value : undefined)
  text.value = ''
  images.value = []
  nextTick(() => { if (textareaEl.value) textareaEl.value.style.height = '' })
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); handleSubmit() }
}

// Handle paste for both text and images
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

function copyAi() {
  if (!props.aiMsg) return
  navigator.clipboard.writeText(props.aiMsg).then(() => {
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  }).catch(() => {})
}

// Quick prompts from settings
const quickPrompts = computed(() => props.settings.quickPrompts)
function insertQuick(t: string) {
  text.value = t
  nextTick(() => textareaEl.value?.focus())
}
async function pasteFromClipboard() {
  try { const t = await navigator.clipboard.readText(); if (t) text.value += t } catch {}
}

async function cleanupStale() {
  if (cleaning.value) return
  cleaning.value = true
  cleanedMsg.value = ''
  try {
    const res = await fetch('/cleanup', { method: 'POST' })
    const data = await res.json()
    if (data.ok) {
      cleanedMsg.value = data.removed > 0 ? `已清理 ${data.removed} 个失效对话` : '没有失效对话'
    }
  } catch {
    cleanedMsg.value = '清理失败'
  } finally {
    cleaning.value = false
    setTimeout(() => { cleanedMsg.value = '' }, 3000)
  }
}

onMounted(() => {
  lastPhase = props.phase
  relTimer = window.setInterval(() => { now.value = Date.now() }, 1000)
  document.addEventListener('keydown', onEscKey)
})
onUnmounted(() => {
  clearInterval(relTimer)
  document.removeEventListener('keydown', onEscKey)
})
</script>

<template>
  <div :class="mode === 'sidebar' ? 'flex flex-col h-full' : 'flex-1 flex flex-col min-w-0 overflow-hidden'">
  <!-- ==================== SIDEBAR MODE ==================== -->
  <template v-if="mode === 'sidebar'">
    <!-- Brand -->
    <div class="h-14 flex items-center px-5 gap-3 shrink-0">
      <img src="/avatar.png" alt="" class="w-7 h-7 rounded-full object-cover" />
      <span class="text-base font-normal text-[--text-primary]">maile456</span>
    </div>
    <!-- Search -->
    <div class="px-3 mb-1">
      <div class="relative">
        <Search :size="14" class="absolute left-3 top-1/2 -translate-y-1/2 text-[--text-dim]" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索对话..."
          class="w-full h-8 pl-8 pr-3 rounded-lg bg-[--bg-hover] text-sm text-[--text-primary] placeholder:text-[--text-dim] border-none outline-none focus:ring-1 focus:ring-[--accent]/30 transition-all"
        />
      </div>
    </div>
    <!-- Session list with time groups -->
    <div class="flex-1 overflow-y-auto px-2 pb-4">
      <template v-if="timeGroupedSessions.length > 0">
        <div v-for="group in timeGroupedSessions" :key="group.label" class="mb-2">
          <div class="text-[11px] text-[--text-dim] uppercase tracking-wider px-3 py-1.5 font-medium">{{ group.label }}</div>
          <button
            v-for="s in group.sessions" :key="s.sid"
            @click="emit('switchSession', s.sid)"
            class="session-item w-full text-left px-3 py-2.5 rounded-2xl text-sm transition-all group flex items-center gap-3 mb-0.5 relative"
            :class="s.sid === sid ? 'bg-[--bg-tertiary] text-[--text-primary]' : 'text-[--text-secondary] hover:bg-[--bg-hover]'"
          >
            <MessageSquare :size="16" class="shrink-0 text-[--text-muted]" />
            <div class="flex-1 min-w-0">
              <div class="truncate leading-snug">{{ s.preview || '新会话' }}</div>
              <div v-if="s.source || s.project" class="flex items-center gap-1 mt-1 flex-wrap">
                <span v-if="s.source" class="inline-flex items-center px-1.5 py-px rounded text-[10px] border leading-tight" :class="sourceClass(s.source)">
                  {{ s.source }}
                </span>
                <span v-if="s.project && s.project !== '(default)'" class="inline-flex items-center gap-0.5 px-1.5 py-px rounded text-[10px] border border-[--border-color] bg-[--bg-hover] text-[--text-muted] leading-tight max-w-[140px]">
                  <FolderOpen :size="10" class="shrink-0" />
                  <span class="truncate">{{ s.project }}</span>
                </span>
              </div>
              <div class="text-xs text-[--text-dim] truncate mt-0.5">
                <span v-if="s.phase === 'waiting_for_ai'" class="text-amber-400/80">思考中 <span class="tabular-nums">{{ thinkingTime(s.updated) }}</span></span>
                <span v-else-if="unreadSids?.has(s.sid) && s.sid !== sid" class="text-red-400/80">未读</span>
                <span v-else class="text-zinc-500">{{ relTime(s.updated || s.created) }}</span>
                <span v-if="(s.msg_count && s.msg_count > 1) || s.model"> · </span>
                <span v-if="s.msg_count && s.msg_count > 1">{{ s.msg_count }} 条</span>
                <span v-if="s.msg_count && s.msg_count > 1 && s.model"> · </span>
                <span v-if="s.model">{{ s.model }}</span>
              </div>
            </div>
            <span v-if="unreadSids?.has(s.sid) && s.sid !== sid" class="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0 shadow-[0_0_6px_rgba(239,68,68,0.5)]" />
            <span v-else-if="s.phase === 'waiting_for_user'" class="w-2 h-2 rounded-full bg-blue-400 shrink-0 animate-pulse" />
            <button @click.stop="emit('deleteSession', s.sid)" class="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 hover:bg-[--bg-hover] text-[--text-muted] hover:text-red-400 transition-all" title="删除">
              <X :size="14" />
            </button>
          </button>
        </div>
      </template>
      <div v-else class="px-3 py-10 text-center text-sm text-[--text-dim]">
        {{ searchQuery ? '未找到匹配的对话' : '暂无会话' }}
      </div>
    </div>
    <!-- Cleanup button -->
    <div class="shrink-0 px-3 pb-3">
      <button
        @click="cleanupStale"
        :disabled="cleaning"
        class="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs transition-all"
        :class="cleaning ? 'text-[--text-dim] cursor-not-allowed' : 'text-[--text-muted] hover:text-[--text-primary] hover:bg-[--bg-hover]'"
      >
        <Loader2 v-if="cleaning" :size="14" class="animate-spin" />
        <Trash2 v-else :size="14" />
        <span>{{ cleanedMsg || '清理失效对话' }}</span>
      </button>
    </div>
  </template>

  <!-- ==================== MAIN MODE ==================== -->
  <template v-else>
    <!-- AI content -->
    <div ref="aiEl" class="flex-1 overflow-y-auto relative" @scroll="onAiScroll">
      <div v-if="aiMsg" class="max-w-[48rem] mx-auto px-6 pt-6 pb-10">
        <!-- Model label -->
        <div class="flex items-center gap-3 mb-4">
          <img src="/avatar.png" alt="maile456" class="w-8 h-8 rounded-full object-cover" />
          <div>
            <div class="text-sm font-medium text-[--text-primary]">{{ displayName }}</div>
            <div v-if="currentSource" class="text-xs text-[--text-muted]">{{ currentSource }}</div>
          </div>
        </div>
        <!-- AI message body -->
        <div class="md-body" :style="{ fontSize: (settings.fontSize || 16) + 'px' }" v-html="renderedHtml" />
        <!-- Action row -->
        <div class="flex items-center gap-1 mt-4 pt-3 border-t border-[--border-color]">
          <button @click="copyAi" class="h-8 px-3 flex items-center gap-1.5 rounded-full text-sm hover:bg-[--bg-hover] transition-colors" :class="copied ? 'text-blue-400' : 'text-[--text-muted]'" title="复制">
            <component :is="copied ? Check : Copy" :size="16" />
            <span>{{ copied ? '已复制' : '复制' }}</span>
          </button>
        </div>

        <!-- Thinking indicator (when AI is processing next reply) -->
        <div v-if="phase === 'waiting_for_ai'" class="mt-8 flex items-center gap-3">
          <img src="/avatar.png" alt="" class="w-8 h-8 rounded-full object-cover" />
          <div class="flex gap-1.5">
            <span class="w-2 h-2 rounded-full bg-[--text-dim] animate-bounce" style="animation-delay:0ms" />
            <span class="w-2 h-2 rounded-full bg-[--text-dim] animate-bounce" style="animation-delay:150ms" />
            <span class="w-2 h-2 rounded-full bg-[--text-dim] animate-bounce" style="animation-delay:300ms" />
          </div>
          <span class="text-sm text-[--text-muted]">正在思考...</span>
        </div>
      </div>

      <!-- Empty / Thinking state -->
      <div v-else class="flex flex-col items-center justify-center h-full text-center select-none px-6">
        <template v-if="phase === 'waiting_for_ai'">
          <div class="flex items-center gap-3 mb-4">
            <img src="/avatar.png" alt="" class="w-10 h-10 rounded-full object-cover" />
            <div class="flex gap-1.5">
              <span class="w-2.5 h-2.5 rounded-full bg-[--text-dim] animate-bounce" style="animation-delay:0ms" />
              <span class="w-2.5 h-2.5 rounded-full bg-[--text-dim] animate-bounce" style="animation-delay:150ms" />
              <span class="w-2.5 h-2.5 rounded-full bg-[--text-dim] animate-bounce" style="animation-delay:300ms" />
            </div>
          </div>
          <div class="text-sm text-[--text-muted]">maile456 正在思考...</div>
        </template>
        <template v-else>
          <div class="text-[--text-muted] text-lg mb-2 font-normal tracking-wide">Hi there</div>
          <div class="text-[--text-primary] text-4xl font-light tracking-tight">在 IDE 中开始对话</div>
        </template>
      </div>

      <!-- Scroll to top -->
      <Transition name="tab-fade">
        <button v-if="showScrollTop" @click="scrollToTop"
          class="fixed bottom-28 right-6 w-10 h-10 bg-[--bg-tertiary] rounded-full flex items-center justify-center text-[--text-muted] hover:text-[--text-primary] hover:bg-[--bg-hover] transition-all shadow-xl z-10 text-lg"
          title="回到顶部">
          ↑
        </button>
      </Transition>
    </div>

    <!-- Floating composer -->
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
            :placeholder="phase === 'waiting_for_user' ? '输入你的回复...' : 'Ask maile456'"
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
            :class="sending ? 'text-[--text-dim] cursor-not-allowed' : (text.trim() || images.length > 0) ? 'bg-[--text-primary] text-[--bg-primary] hover:bg-[--text-primary]' : 'text-[--text-dim] cursor-not-allowed'"
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
  </template>

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
