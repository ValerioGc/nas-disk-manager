import { afterEach, expect, it } from 'vitest';
import { locale, messages, setLocale, useI18n } from '@/i18n';

const originalLocale = locale.value;
const originalLang = document.documentElement.lang;
afterEach(() => {
  locale.value = originalLocale;
  document.documentElement.lang = originalLang;
});

it('reactively shares translations and updates the document language', () => {
  const first = useI18n();
  const second = useI18n();
  first.setLocale('en');
  expect(first.t.value).toBe(messages.en);
  expect(second.locale.value).toBe('en');
  expect(second.t.value).toBe(messages.en);
  expect(document.documentElement.lang).toBe('en');
  setLocale('it');
  expect(first.t.value).toBe(messages.it);
  expect(second.t.value).toBe(messages.it);
  expect(document.documentElement.lang).toBe('it');
});
