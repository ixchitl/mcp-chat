<script setup lang="ts">
import { ref, computed } from 'vue'
import AppHeader from './components/AppHeader.vue'
import WorkspaceTab from './components/WorkspaceTab.vue'
import ChatMode from './components/ChatMode.vue'
import GuideTab from './components/GuideTab.vue'
import SettingsTab from './components/SettingsTab.vue'
import AboutTab from './components/AboutTab.vue'
import VaultTab from './components/VaultTab.vue'
import TodoFab from './components/TodoFab.vue'
import { useChat } from './composables/useChat'
import { useSettings } from './composables/useSettings'

const activeTab = ref('workspace')
const sidebarOpen = ref(true)
const appMode = ref<'chat' | 'code' | 'vault'>('chat')
const { aiMsg, phase, sending, connected, sid, sessions, activeSid, wsLatency, submitError, pendingUpdates, unreadSids, submit, switchSession, deleteSession, deleteProject } = useChat()
const { settings, toggleTheme } = useSettings()

const waitingCount = computed(() => sessions.value.filter(s => s.phase === 'waiting_for_user').length)
const projectCount = computed(() => new Set(sessions.value.map(s => s.project || '(default)')).size)
const currentTitle = computed(() => {
  const s = sessions.value.find(s => s.sid === sid.value)
  return s?.preview || ''
})
</script>

<template>
  <div class="h-screen flex bg-[--bg-primary] text-[--text-secondary] overflow-hidden">
    <!-- Sidebar -->
    <Transition name="sidebar">
      <div v-if="sidebarOpen" class="w-[256px] shrink-0 flex flex-col bg-[--bg-secondary] overflow-hidden">
        <WorkspaceTab
          mode="sidebar"
          :aiMsg="aiMsg" :phase="phase" :sending="sending" :sid="sid"
          :sessions="sessions" :activeSid="activeSid" :settings="settings" :submitError="submitError" :unreadSids="unreadSids"
          @submit="submit" @switchSession="switchSession" @deleteSession="deleteSession" @deleteProject="deleteProject"
        />
      </div>
    </Transition>

    <!-- Main area -->
    <div class="flex-1 flex flex-col min-w-0 overflow-hidden">
      <AppHeader
        :activeTab="activeTab" :connected="connected" :waitingCount="waitingCount"
        :sessionCount="sessions.length" :projectCount="projectCount"
        :currentTitle="currentTitle" :sidebarOpen="sidebarOpen" :appMode="appMode" :settings="settings"
        @update:activeTab="activeTab = $event"
        @toggleSidebar="sidebarOpen = !sidebarOpen"
        @update:appMode="appMode = $event"
        @toggleTheme="toggleTheme"
      />

      <!-- Chat / Code / Vault mode — only show when activeTab is workspace -->
      <template v-if="activeTab === 'workspace'">
        <ChatMode
          v-show="appMode === 'chat'"
          :aiMsg="aiMsg" :phase="phase" :sending="sending" :sid="sid"
          :sessions="sessions" :activeSid="activeSid" :settings="settings" :submitError="submitError" :pendingUpdates="pendingUpdates"
          @submit="submit" @switchSession="switchSession" @deleteSession="deleteSession" @deleteProject="deleteProject"
        />
        <WorkspaceTab
          v-show="appMode === 'code'"
          mode="main"
          :aiMsg="aiMsg" :phase="phase" :sending="sending" :sid="sid"
          :sessions="sessions" :activeSid="activeSid" :settings="settings" :submitError="submitError" :unreadSids="unreadSids"
          @submit="submit" @switchSession="switchSession" @deleteSession="deleteSession" @deleteProject="deleteProject"
        />
        <VaultTab
          v-show="appMode === 'vault'"
          :settings="settings"
        />
      </template>

      <Transition name="tab-fade" mode="out-in">
        <KeepAlive>
          <GuideTab v-if="activeTab === 'guide'" />
          <SettingsTab v-else-if="activeTab === 'settings'" :settings="settings" />
          <AboutTab v-else-if="activeTab === 'about'" :connected="connected" :sessionCount="sessions.length" :waitingCount="waitingCount" />
        </KeepAlive>
      </Transition>
    </div>

    <!-- Floating Todo -->
    <TodoFab />
  </div>
</template>
