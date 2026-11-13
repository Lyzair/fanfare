import type { PackBase } from './index';
import type { SportId } from '../domain/model';
import { makeTemplates } from './templates';

const sports: Record<SportId, { name: string; scoreWord: string; positions: string[] }> = {
  football: { name: 'Football', scoreWord: 'Goal', positions: ['Goalkeeper', 'Defence', 'Midfield', 'Attack'] },
  handball: { name: 'Handball', scoreWord: 'Goal', positions: ['Goalkeeper', 'Left wing', 'Left back', 'Centre back', 'Right back', 'Right wing', 'Pivot'] },
  basketball: { name: 'Basketball', scoreWord: 'Basket', positions: ['Point guard', 'Shooting guard', 'Small forward', 'Power forward', 'Center'] },
  volleyball: { name: 'Volleyball', scoreWord: 'Point', positions: ['Setter', 'Outside hitter', 'Opposite', 'Middle blocker', 'Libero'] },
  fieldhockey: { name: 'Field hockey', scoreWord: 'Goal', positions: ['Goalkeeper', 'Defence', 'Midfield', 'Attack'] },
  icehockey: { name: 'Ice hockey', scoreWord: 'Goal', positions: ['Goaltender', 'Defence', 'Centre', 'Wing'] },
  floorball: { name: 'Floorball', scoreWord: 'Goal', positions: ['Goalkeeper', 'Defence', 'Centre', 'Attack'] },
};

const templates = makeTemplates(
  {
    intro: "Hello everyone and welcome[ to today's game against {opponent}]! Here comes the lineup[ of {home}]! Let's have a fair and fun game together!",
    field: 'And now[ on {position}][, number {number}]: {name}! Have fun and give it your all!',
    bench: 'Ready to jump in from the bench: {name}! Great to have you with us!',
    score: '{score}[ for {home}]![ Well done, {name}!] Fantastic, keep it up!',
  },
  sport => sports[sport].scoreWord,
);

export const en = {
  code: 'en',
  nativeName: 'English',
  dir: 'ltr',
  ui: {
    appTitle: 'Sports Caller',
    sportLabel: 'Sport',
    languageLabel: 'Language',
    step1Title: 'Match & players',
    step1Hint: 'Enter the teams and add your players.',
    step2Title: 'Announcements',
    step2Hint: 'Choose what the announcer says.',
    step3Title: 'Game',
    step3Hint: 'Run the game and tap to call out players and goals.',
    step4Title: 'Sounds & voice',
    step4Hint: 'Pick a voice and fun sounds.',
    step5Title: 'Save & privacy',
    step5Hint: 'Your data stays on this device.',
  },
  sports,
  staffHeadings: ['Coach', 'Assistant coach', 'Staff', 'Team officials'],
  templates,
} satisfies PackBase & { ui: Record<string, string> };
