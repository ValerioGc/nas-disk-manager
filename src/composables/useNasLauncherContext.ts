import { computed } from 'vue';
import { useNasLauncherContext as useLauncherContext } from '@valeriogc/nas-base-app';
import { locale, messages, setLocale } from '@/i18n';
import { shell } from '@/services/nasShell';

export function useNasLauncherContext() {
  const { active } = useLauncherContext({ shell, onLocaleChange: setLocale });
  const t = computed(() => messages[locale.value]);
  return { locale, t, active };
}
