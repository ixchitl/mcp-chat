<script setup lang="ts">
import { Menu, MessageCircle, Code2, BookOpen, Sun, Moon } from 'lucide-vue-next'
import type { Settings } from '../composables/useSettings'

const props = defineProps<{ activeTab: string; connected: boolean; waitingCount: number; sessionCount: number; projectCount: number; currentTitle: string; sidebarOpen: boolean; appMode: 'chat' | 'code' | 'vault'; settings: Settings }>()
const emit = defineEmits<{ 'update:activeTab': [tab: string]; 'toggleSidebar': []; 'update:appMode': [mode: 'chat' | 'code' | 'vault']; 'toggleTheme': [] }>()
</script>

<template>
  <header class="flex items-center h-14 px-3 select-none shrink-0">
    <!-- Left: hamburger -->
    <button @click="emit('toggleSidebar')" class="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[--bg-hover] transition-colors shrink-0">
      <Menu :size="20" class="text-[--text-muted]" />
    </button>

    <!-- Center: mode toggle -->
    <div class="flex-1 flex items-center justify-center">
      <div class="flex items-center bg-[--bg-secondary] rounded-full p-1 gap-0.5">
        <button
          @click="emit('update:appMode', 'chat')"
          class="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm transition-all duration-200"
          :class="appMode === 'chat' ? 'bg-[--bg-active] text-[--text-primary] shadow-sm' : 'text-[--text-muted] hover:text-[--text-secondary]'"
        >
          <MessageCircle :size="15" />
          <span>聊天</span>
        </button>
        <button
          @click="emit('update:appMode', 'code')"
          class="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm transition-all duration-200"
          :class="appMode === 'code' ? 'bg-[--bg-active] text-[--text-primary] shadow-sm' : 'text-[--text-muted] hover:text-[--text-secondary]'"
        >
          <Code2 :size="15" />
          <span>工作</span>
        </button>
        <button
          @click="emit('update:appMode', 'vault')"
          class="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm transition-all duration-200"
          :class="appMode === 'vault' ? 'bg-[--bg-active] text-[--text-primary] shadow-sm' : 'text-[--text-muted] hover:text-[--text-secondary]'"
        >
          <BookOpen :size="15" />
          <span>笔记</span>
        </button>
      </div>
    </div>

    <!-- Right: theme toggle + status -->
    <div class="flex items-center gap-2 pr-1 shrink-0">
      <button @click="emit('toggleTheme')" class="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[--bg-hover] transition-colors" :title="settings.theme === 'dark' ? '切换浅色模式' : '切换深色模式'">
        <Sun v-if="settings.theme === 'dark'" :size="18" class="text-[--text-muted]" />
        <Moon v-else :size="18" class="text-[--text-muted]" />
      </button>
      <span v-if="waitingCount > 0" class="text-xs font-medium px-2.5 py-1 rounded-full text-[--accent] bg-[--accent-bg]">
        {{ waitingCount }} 待回复
      </span>
      <span class="w-2 h-2 rounded-full shrink-0" :class="connected ? 'bg-emerald-500' : 'bg-zinc-600'" :title="connected ? '已连接' : '离线'" />
    </div>
  </header>
</template>
