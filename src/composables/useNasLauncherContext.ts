import { computed } from 'vue';
import { useNasLauncherContext as useLauncherContext } from '@valeriogc/nas-base-app';
import { locale, messages, setLocale } from '@/i18n';
import { shell } from '@/services/nasShell';

/** The context of the launcher, on the bridge of the application, with its catalogue. */
export function useNasLauncherContext() {
  const { active } = useLauncherContext({ shell, onLocaleChange: setLocale });
  const t = computed(() => messages[locale.value]);
  return { locale, t, active };
}
