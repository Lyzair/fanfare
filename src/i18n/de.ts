import type { LanguagePack } from './index';
import type { SportId } from '../domain/model';
import { makeTemplates } from './templates';

const sports: Record<SportId, { name: string; scoreWord: string; positions: string[] }> = {
  football: { name: 'Fußball', scoreWord: 'Tor', positions: ['Torwart', 'Abwehr', 'Mittelfeld', 'Angriff'] },
  handball: { name: 'Handball', scoreWord: 'Tor', positions: ['Torwart', 'Linksaußen', 'Rückraum links', 'Rückraum Mitte', 'Rückraum rechts', 'Rechtsaußen', 'Kreisläufer'] },
  basketball: { name: 'Basketball', scoreWord: 'Korb', positions: ['Aufbauspieler', 'Shooting Guard', 'Flügelspieler', 'Power Forward', 'Center'] },
  volleyball: { name: 'Volleyball', scoreWord: 'Punkt', positions: ['Zuspieler', 'Außenangreifer', 'Diagonalangreifer', 'Mittelblocker', 'Libero'] },
  fieldhockey: { name: 'Feldhockey', scoreWord: 'Tor', positions: ['Torwart', 'Abwehr', 'Mittelfeld', 'Angriff'] },
  icehockey: { name: 'Eishockey', scoreWord: 'Tor', positions: ['Torhüter', 'Verteidigung', 'Center', 'Flügel'] },
  floorball: { name: 'Floorball', scoreWord: 'Tor', positions: ['Torhüter', 'Verteidigung', 'Center', 'Angriff'] },
};

const templates = makeTemplates(
  {
    intro: 'Hallo zusammen und herzlich willkommen[ zum heutigen Spiel gegen {opponent}]! Hier kommt die Aufstellung[ von {home}]! Auf ein faires Spiel mit viel Spaß!',
    field: 'Und jetzt[ auf der Position {position}][, mit der Nummer {number}]: {name}! Viel Spaß und gib alles!',
    bench: 'Auf der Bank, bereit zum Einwechseln: {name}! Schön, dass du dabei bist!',
    score: '{score}[ für {home}]![ Super gemacht, {name}!] Klasse, weiter so!',
  },
  sport => sports[sport].scoreWord,
  { football: 'Toooor' },
);

export const de = {
  code: 'de',
  nativeName: 'Deutsch',
  dir: 'ltr',
  ui: {
    appTitle: 'Sports Caller',
    sportLabel: 'Sportart',
    languageLabel: 'Sprache',
    step1Title: 'Spiel & Spieler',
    step1Hint: 'Trage die Mannschaften ein und füge deine Spieler hinzu.',
    step2Title: 'Ansagen',
    step2Hint: 'Wähle, was der Ansager sagt.',
    step3Title: 'Spiel',
    step3Hint: 'Starte das Spiel und tippe, um Spieler und Tore auszurufen.',
    step4Title: 'Klänge & Stimme',
    step4Hint: 'Wähle eine Stimme und lustige Klänge.',
    step5Title: 'Speichern & Datenschutz',
    step5Hint: 'Deine Daten bleiben auf diesem Gerät.',
    saveUnavailable: "Speichern auf diesem Gerät ist nicht möglich – nutze „Exportieren“, um dein Team zu behalten.",
  },
  sports,
  staffHeadings: ['Trainer', 'Co-Trainer', 'Betreuer', 'Teamoffizielle'],
  templates,
} satisfies LanguagePack;
