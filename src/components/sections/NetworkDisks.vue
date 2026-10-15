<script setup lang="ts">

import { computed, reactive, ref } from 'vue';
import { NasIcon, NasSwitch } from '@valeriogc/nas-base-app';
import { useDiskManager } from '@/composables/diskManagerContext';
import { useNetworkDisks } from '@/composables/useNetworkDisks';
import { notifyNasShell } from '@/services/nasShell';
import network from '@/assets/icons/network.svg?url';
import type { NetworkDisk } from '@/types';

const { t, secure } = useDiskManager();
const { state, working, networkError, network: ask } = useNetworkDisks(t);

/** The disk being added (no id) or changed, while its form is open. */
const editing = ref<string | null | undefined>(undefined);
const form = reactive({
  name: '',
  server: '',
  share: '',
  username: '',
  password: '',
  domain: '',
  automatic: true,
});
const forgetting = ref<NetworkDisk | null>(null);
const tested = ref(false);

const open = computed(() => editing.value !== undefined);
const complete = computed(
  () =>
    Boolean(form.name.trim() && form.server.trim() && form.share.trim() && form.username.trim()) &&
    (editing.value !== null || Boolean(form.password)),
);

function start(disk?: NetworkDisk) {
  Object.assign(form, {
    name: disk?.name ?? '',
    server: disk?.server ?? '',
    share: disk?.share ?? '',
    username: disk?.username ?? '',
    password: '',
    domain: disk?.domain ?? '',
    automatic: disk?.automatic ?? true,
  });
  tested.value = false;
  editing.value = disk?.id ?? null;
}

const account = () => ({
  server: form.server.trim(),
  share: form.share.trim(),
  username: form.username.trim(),
  domain: form.domain.trim() || undefined,
});

async function test() {
  tested.value = await ask({ op: 'networkTest', ...account(), password: form.password });
}

async function save() {
  const saved = await ask({
    op: 'networkSave',
    id: editing.value ?? undefined,
    name: form.name.trim(),
    ...account(),
    password: form.password || undefined,
    automatic: form.automatic,
  });
  if (saved) {
    editing.value = undefined;
    notifyNasShell(t.value.smbSaved, '', 'success');
  }
}

async function toggle(disk: NetworkDisk) {
  await ask({ op: disk.connected ? 'networkDisconnect' : 'networkConnect', id: disk.id });
}

async function forget() {
  const disk = forgetting.value;
  forgetting.value = null;
  if (disk) {
    await ask({ op: 'networkForget', id: disk.id });
  }
}

</script>

<template>
  <section
    class="network_card surface_card"
    :aria-label="t.kinds.network"
    data-testid="network_disks"
  >
    <NasIcon :svg="network" class="network_icon" />
    <div class="network_text">
      <h2>{{ t.kinds.network }}</h2>
      <p v-if="!state.available" data-testid="network_unavailable">{{ t.smbUnavailable }}</p>
      <template v-else>
        <p v-if="!state.disks.length && !open">{{ t.smbEmpty }}</p>
        <ul class="share_list">
          <li v-for="disk in state.disks" :key="disk.id" :data-testid="`network_${disk.id}`">
            <div>
              <strong>{{ disk.name }}</strong>
              <small>//{{ disk.server }}/{{ disk.share }} · {{ disk.username }}</small>
              <span :class="['status', { off: !disk.connected }]">
                {{ disk.connected ? t.smbConnected : t.smbDisconnected }}
              </span>
            </div>
            <div class="share_actions">
              <button
                type="button"
                class="secondary_button"
                :disabled="working"
                @click="toggle(disk)"
              >
                {{ disk.connected ? t.smbDisconnect : t.smbConnect }}
              </button>
              <button
                type="button"
                class="secondary_button"
                :disabled="working || open"
                @click="start(disk)"
              >
                {{ t.smbEdit }}
              </button>
              <button
                type="button"
                class="danger_button"
                :disabled="working"
                @click="forgetting = disk"
              >
                {{ t.smbForget }}
              </button>
            </div>
          </li>
        </ul>

        <p v-if="forgetting" class="warning" data-testid="network_forget">
          {{ t.smbForgetConfirm.replace('{name}', forgetting.name) }}
          <button type="button" class="danger_button" @click="forget">{{ t.smbForget }}</button>
          <button type="button" class="secondary_button" @click="forgetting = null">
            {{ t.cancel }}
          </button>
        </p>

        <form v-if="open" class="action_section" data-testid="network_form" @submit.prevent="save">
          <p v-if="!secure" class="hint">{{ t.encryptionNeedsHttps }}</p>
          <label
            ><span>{{ t.smbName }}</span
            ><input v-model="form.name" maxlength="40" autocomplete="off" data-testid="smb_name"
          /></label>
          <label
            ><span>{{ t.smbServer }}</span
            ><input
              v-model="form.server"
              maxlength="253"
              autocomplete="off"
              spellcheck="false"
              data-testid="smb_server"
          /></label>
          <label
            ><span>{{ t.smbShare }}</span
            ><input v-model="form.share" maxlength="80" autocomplete="off" data-testid="smb_share"
          /></label>
          <label
            ><span>{{ t.smbUser }}</span
            ><input
              v-model="form.username"
              maxlength="64"
              autocomplete="off"
              data-testid="smb_user"
          /></label>
          <label
            ><span>{{ editing ? t.smbPasswordKeep : t.smbPassword }}</span
            ><input
              v-model="form.password"
              type="password"
              autocomplete="off"
              :disabled="!secure"
              data-testid="smb_password"
          /></label>
          <label
            ><span>{{ t.smbDomain }}</span
            ><input
              v-model="form.domain"
              maxlength="64"
              autocomplete="off"
              data-testid="smb_domain"
          /></label>
          <NasSwitch v-model="form.automatic" :label="t.smbAutomatic" testid="smb_automatic" />
          <p v-if="tested" class="hint" data-testid="smb_tested">{{ t.smbTestOk }}</p>
          <div class="share_actions">
            <button
              type="button"
              class="secondary_button"
              :disabled="working || !complete || !form.password"
              data-testid="smb_test"
              @click="test"
            >
              {{ t.smbTest }}
            </button>
            <button
              type="submit"
              class="secondary_button"
              :disabled="working || !complete"
              data-testid="smb_save"
            >
              {{ t.smbSave }}
            </button>
            <button type="button" class="secondary_button" @click="editing = undefined">
              {{ t.cancel }}
            </button>
          </div>
        </form>
        <button v-else type="button" class="add_button" data-testid="network_add" @click="start()">
          {{ t.smbAdd }}
        </button>
        <p v-if="networkError" class="operation_error" role="alert">{{ networkError }}</p>
      </template>
    </div>
  </section>
</template>

<style scoped lang="scss">

.network_card {
  display: flex;
  gap: 20px;
  margin-top: 32px;
  padding: 28px;
}

.network_icon {
  --app-icon-size: 32px;
  color: var(--accent);
}

.network_text {
  flex: 1;
  max-width: 720px;

  h2 {
    margin: 0 0 10px;
    color: var(--heading-color);
    font-size: 17px;
  }

  p {
    margin: 0 0 10px;
    color: #718396;
    line-height: 1.5;
  }
}

.share_list {
  display: grid;
  gap: 12px;
  margin: 0 0 16px;
  padding: 0;
  list-style: none;

  li {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 0;
    border-bottom: 1px solid var(--table-border);
  }

  small {
    display: block;
    color: #718396;
  }
}

.share_actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.status.off {
  opacity: 0.7;
}

.add_button {
  margin-top: 8px;
  padding: 10px 18px;
  border: 1px solid var(--accent);
  border-radius: 8px;
  color: var(--accent);
  background: transparent;
  font: inherit;
  font-weight: 650;
}

</style>
