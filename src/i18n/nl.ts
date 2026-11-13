// Translation: machine-assisted — native speakers, please review.
import type { LanguagePack } from './index';
import type { SportId } from '../domain/model';
import { makeTemplates } from './templates';

const sports: Record<SportId, { name: string; scoreWord: string; positions: string[] }> = {
  football: { name: 'Voetbal', scoreWord: 'Doelpunt', positions: ['Keeper', 'Verdediging', 'Middenveld', 'Aanval'] },
  handball: { name: 'Handbal', scoreWord: 'Doelpunt', positions: ['Keeper', 'Linksbuiten', 'Linksachter', 'Middenachter', 'Rechtsachter', 'Rechtsbuiten', 'Cirkelspeler'] },
  basketball: { name: 'Basketbal', scoreWord: 'Basket', positions: ['Spelmaker', 'Shooting guard', 'Small forward', 'Power forward', 'Center'] },
  volleyball: { name: 'Volleybal', scoreWord: 'Punt', positions: ['Spelverdeler', 'Buitenaanvaller', 'Diagonaal', 'Middenblokker', 'Libero'] },
  fieldhockey: { name: 'Hockey', scoreWord: 'Doelpunt', positions: ['Keeper', 'Verdediging', 'Middenveld', 'Aanval'] },
  icehockey: { name: 'IJshockey', scoreWord: 'Doelpunt', positions: ['Keeper', 'Verdediger', 'Center', 'Vleugel'] },
  floorball: { name: 'Floorball', scoreWord: 'Doelpunt', positions: ['Keeper', 'Verdediging', 'Middenveld', 'Aanval'] },
};

const templates = makeTemplates(
  {
    intro: 'Hallo allemaal en welkom[ bij de wedstrijd van vandaag tegen {opponent}]! Hier komt de opstelling[ van {home}]! Laten we samen een eerlijke en leuke wedstrijd spelen!',
    field: 'En nu[ op de positie {position}][, met nummer {number}]: {name}! Veel plezier en geef alles!',
    bench: 'Klaar om vanaf de bank in te vallen: {name}! Fijn dat je erbij bent!',
    score: '{score}[ voor {home}]![ Goed gedaan, {name}!] Fantastisch, ga zo door!',
  },
  sport => sports[sport].scoreWord,
  { football: 'Doeeelpunt' },
);

export const nl = {
  code: 'nl',
  nativeName: 'Nederlands',
  dir: 'ltr',
  ui: {
    appTitle: 'Sports Caller',
    sportLabel: 'Sport',
    languageLabel: 'Taal',
    step1Title: 'Wedstrijd en spelers',
    step1Hint: 'Vul de teams in en voeg je spelers toe.',
    step2Title: 'Aankondigingen',
    step2Hint: 'Kies wat de omroeper zegt.',
    step3Title: 'Wedstrijd',
    step3Hint: 'Start de wedstrijd en tik om spelers en doelpunten af te roepen.',
    step4Title: 'Geluiden en stem',
    step4Hint: 'Kies een stem en leuke geluiden.',
    step5Title: 'Opslaan en privacy',
    step5Hint: 'Je gegevens blijven op dit apparaat.',
    saveUnavailable: "Opslaan op dit apparaat is niet mogelijk — gebruik Exporteren om je team te bewaren.",
  },
  sports,
  staffHeadings: ['Trainer', 'Assistent-trainer', 'Staf', 'Teamofficials'],
  templates,
} satisfies LanguagePack;
