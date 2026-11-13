// Translation: machine-assisted — native speakers, please review.
import type { LanguagePack } from './index';
import type { SportId } from '../domain/model';
import { makeTemplates } from './templates';

const sports: Record<SportId, { name: string; scoreWord: string; positions: string[] }> = {
  football: { name: 'Футбол', scoreWord: 'Гол', positions: ['Воротар', 'Захист', 'Півзахист', 'Напад'] },
  handball: { name: 'Гандбол', scoreWord: 'Гол', positions: ['Воротар', 'Лівий крайній', 'Лівий півсередній', 'Центральний', 'Правий півсередній', 'Правий крайній', 'Лінійний'] },
  basketball: { name: 'Баскетбол', scoreWord: 'Кошик', positions: ['Розігрувальний захисник', 'Атакувальний захисник', 'Легкий форвард', 'Важкий форвард', 'Центровий'] },
  volleyball: { name: 'Волейбол', scoreWord: 'Очко', positions: ['Зв’язувальний', 'Догравальник', 'Діагональний', 'Центральний блокувальний', 'Ліберо'] },
  fieldhockey: { name: 'Хокей на траві', scoreWord: 'Гол', positions: ['Воротар', 'Захист', 'Півзахист', 'Напад'] },
  icehockey: { name: 'Хокей із шайбою', scoreWord: 'Гол', positions: ['Воротар', 'Захисник', 'Центральний нападник', 'Крайній нападник'] },
  floorball: { name: 'Флорбол', scoreWord: 'Гол', positions: ['Воротар', 'Захист', 'Півзахист', 'Напад'] },
};

const templates = makeTemplates(
  {
    intro: 'Всім привіт і ласкаво просимо[ на сьогоднішній матч проти {opponent}]! Ось склад[ команди {home}]! Давайте зіграємо чесно та весело разом!',
    field: 'А тепер[ на позиції {position}][, з номером {number}]: {name}! Гарної гри, викладайся на повну!',
    bench: 'Готовий вийти на заміну з лави запасних: {name}! Чудово, що ти з нами!',
    score: '{score}[ для {home}]![ Молодець, {name}!] Чудово, так тримати!',
  },
  sport => sports[sport].scoreWord,
  { football: 'Гооол' },
);

export const uk = {
  code: 'uk',
  nativeName: 'Українська',
  dir: 'ltr',
  ui: {
    appTitle: 'Sports Caller',
    sportLabel: 'Вид спорту',
    languageLabel: 'Мова',
    step1Title: 'Матч і гравці',
    step1Hint: 'Введіть команди та додайте своїх гравців.',
    step2Title: 'Оголошення',
    step2Hint: 'Оберіть, що каже диктор.',
    step3Title: 'Гра',
    step3Hint: 'Розпочніть матч і торкайтеся, щоб оголошувати гравців і голи.',
    step4Title: 'Звуки та голос',
    step4Hint: 'Оберіть голос і веселі звуки.',
    step5Title: 'Збереження та приватність',
    step5Hint: 'Ваші дані залишаються на цьому пристрої.',
  },
  sports,
  staffHeadings: ['Тренер', 'Асистент тренера', 'Персонал', 'Офіційні особи команди'],
  templates,
} satisfies LanguagePack;
