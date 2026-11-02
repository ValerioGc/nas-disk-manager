<script setup lang="ts">

import { computed, reactive, ref } from 'vue';
import { NasSwitch } from '@valeriogc/nas-base-app';
import SectionCard from '@/components/commons/SectionCard.vue';
import { useDiskManager } from '@/composables/diskManagerContext';
import { useNetworkDisks } from '@/composables/useNetworkDisks';
import { notifyNasShell } from '@/services/nasShell';
import type { NetworkDisk, NetworkField, NetworkForm } from '@/types';
import { KIND_ICONS } from '@/utils/disks';

const { t, secure } = useDiskManager();
const { state, working, networkError, network: ask } = useNetworkDisks(t);

/** Null while adding, the id while editing, undefined when the form is closed. */
const editing = ref<string | null | undefined>(undefined);
const form = reactive<NetworkForm>({
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
const fields = computed<NetworkField[]>(() => [
  { key: 'name', label: t.value.smbName, testid: 'smb_name', maxlength: 40 },
  {
    key: 'server',
    label: t.value.smbServer,
    testid: 'smb_server',
    maxlength: 253,
    spellcheck: false,
  },
  { key: 'share', label: t.value.smbShare, testid: 'smb_share', maxlength: 80 },
  { key: 'username', label: t.value.smbUser, testid: 'smb_user', maxlength: 64 },
  {
    key: 'password',
    label: editing.value ? t.value.smbPasswordKeep : t.value.smbPassword,
    testid: 'smb_password',
    type: 'password',
  },
  { key: 'domain', label: t.value.smbDomain, testid: 'smb_domain', maxlength: 64 },
]);

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
  <SectionCard :icon="KIND_ICONS.network" :title="t.kinds.network" data-testid="network_disks">
    <template #action>
      <button
        v-if="state.available && !open"
        type="button"
        class="add_button"
        data-testid="network_add"
        @click="start()"
      >
        {{ t.smbAdd }}
      </button>
    </template>
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
        <label v-for="field in fields" :key="field.key"
          ><span>{{ field.label }}</span
          ><input
            v-model="form[field.key]"
            :name="`smb_${field.key}`"
            :type="field.type"
            :maxlength="field.maxlength"
            :spellcheck="field.spellcheck"
            autocomplete="off"
            :disabled="field.type === 'password' && !secure"
            :data-testid="field.testid"
        /></label>
        <NasSwitch v-model="form.automatic" :label="t.smbAutomatic" testid="smb_automatic" />
        <p v-if="tested" class="hint" data-testid="smb_tested">{{ t.smbTestOk }}</p>
        <div class="share_actions form_actions">
          <button
            type="button"
            class="secondary_button"
            :disabled="working || !complete || !form.password"
            data-testid="smb_test"
            @click="test"
          >
            {{ t.smbTest }}
          </button>
          <button type="button" class="secondary_button" @click="editing = undefined">
            {{ t.cancel }}
          </button>
          <button
            type="submit"
            class="secondary_button"
            :disabled="working || !complete"
            data-testid="smb_save"
          >
            {{ t.save }}
          </button>
        </div>
      </form>
      <p v-if="networkError" class="operation_error" role="alert">{{ networkError }}</p>
    </template>
  </SectionCard>
</template>

<style scoped lang="scss">

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
    color: $text_soft;
  }
}

.share_actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.form_actions {
  justify-content: flex-end;
  margin-top: 24px;
}

.status.off {
  opacity: 0.7;
}

</style>
