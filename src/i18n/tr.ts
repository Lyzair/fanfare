// Translation: machine-assisted — native speakers, please review.
import type { LanguagePack } from './index';
import type { SportId } from '../domain/model';
import { makeTemplates } from './templates';

const sports: Record<SportId, { name: string; scoreWord: string; positions: string[] }> = {
  football: { name: 'Futbol', scoreWord: 'Gol', positions: ['Kaleci', 'Defans', 'Orta saha', 'Forvet'] },
  handball: { name: 'Hentbol', scoreWord: 'Gol', positions: ['Kaleci', 'Sol kanat', 'Sol dış', 'Oyun kurucu', 'Sağ dış', 'Sağ kanat', 'Pivot'] },
  basketball: { name: 'Basketbol', scoreWord: 'Sayı', positions: ['Oyun kurucu', 'Şutör gard', 'Küçük forvet', 'Ağır forvet', 'Pivot'] },
  volleyball: { name: 'Voleybol', scoreWord: 'Sayı', positions: ['Pasör', 'Smaçör', 'Çapraz hücumcu', 'Orta oyuncu', 'Libero'] },
  fieldhockey: { name: 'Çim hokeyi', scoreWord: 'Gol', positions: ['Kaleci', 'Defans', 'Orta saha', 'Forvet'] },
  icehockey: { name: 'Buz hokeyi', scoreWord: 'Gol', positions: ['Kaleci', 'Defans', 'Santrfor', 'Kanat'] },
  floorball: { name: 'Floorbol', scoreWord: 'Gol', positions: ['Kaleci', 'Defans', 'Orta saha', 'Forvet'] },
};

const templates = makeTemplates(
  {
    intro: 'Herkese merhaba ve hoş geldiniz[, bugünkü {opponent} maçına]! Kadro geliyor[: {home}]! Birlikte adil ve eğlenceli bir maç oynayalım!',
    field: 'Şimdi[ {position} pozisyonunda][, {number} numaralı]: {name}! İyi eğlenceler ve her şeyini ver!',
    bench: 'Yedek kulübesinden girmeye hazır: {name}! Bizimle olman çok güzel!',
    score: '{score}[ {home} için]![ Aferin, {name}!] Harika, aynen devam!',
  },
  sport => sports[sport].scoreWord,
  { football: 'Goool' },
);

export const tr = {
  code: 'tr',
  nativeName: 'Türkçe',
  dir: 'ltr',
  ui: {
    appTitle: 'Sports Caller',
    sportLabel: 'Spor',
    languageLabel: 'Dil',
    step1Title: 'Maç ve oyuncular',
    step1Hint: 'Takımları gir ve oyuncularını ekle.',
    step2Title: 'Anonslar',
    step2Hint: 'Spikerin ne diyeceğini seç.',
    step3Title: 'Oyun',
    step3Hint: 'Maçı başlat ve oyuncuları ile golleri anons etmek için dokun.',
    step4Title: 'Sesler ve ses seçimi',
    step4Hint: 'Bir ses ve eğlenceli efektler seç.',
    step5Title: 'Kaydet ve gizlilik',
    step5Hint: 'Verilerin bu cihazda kalır.',
    saveUnavailable: "Bu cihazda kaydetme kullanılamıyor — takımını saklamak için Dışa aktar'ı kullan.",
  },
  sports,
  staffHeadings: ['Antrenör', 'Yardımcı antrenör', 'Ekip', 'Takım yetkilileri'],
  templates,
} satisfies LanguagePack;
