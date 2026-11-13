// Translation: machine-assisted — native speakers, please review.
import type { LanguagePack } from './index';
import type { SportId } from '../domain/model';
import { makeTemplates } from './templates';

const sports: Record<SportId, { name: string; scoreWord: string; positions: string[] }> = {
  football: { name: 'Fútbol', scoreWord: 'Gol', positions: ['Portero', 'Defensa', 'Centrocampista', 'Delantero'] },
  handball: { name: 'Balonmano', scoreWord: 'Gol', positions: ['Portero', 'Extremo izquierdo', 'Lateral izquierdo', 'Central', 'Lateral derecho', 'Extremo derecho', 'Pivote'] },
  basketball: { name: 'Baloncesto', scoreWord: 'Canasta', positions: ['Base', 'Escolta', 'Alero', 'Ala-pívot', 'Pívot'] },
  volleyball: { name: 'Voleibol', scoreWord: 'Punto', positions: ['Colocador', 'Atacante exterior', 'Opuesto', 'Central', 'Líbero'] },
  fieldhockey: { name: 'Hockey sobre hierba', scoreWord: 'Gol', positions: ['Portero', 'Defensa', 'Centrocampista', 'Delantero'] },
  icehockey: { name: 'Hockey sobre hielo', scoreWord: 'Gol', positions: ['Portero', 'Defensa', 'Centro', 'Ala'] },
  floorball: { name: 'Floorball', scoreWord: 'Gol', positions: ['Portero', 'Defensa', 'Centrocampista', 'Delantero'] },
};

const templates = makeTemplates(
  {
    intro: '¡Hola a todos y bienvenidos[ al partido de hoy contra {opponent}]! ¡Aquí viene la alineación[ de {home}]! ¡Que sea un partido limpio y divertido para todos!',
    field: 'Y ahora[ en la posición de {position}][, con el número {number}]: ¡{name}! ¡Diviértete y dalo todo!',
    bench: 'Listo para entrar desde el banquillo: ¡{name}! ¡Qué bien tenerte con nosotros!',
    score: '¡{score}[ para {home}]![ ¡Bien hecho, {name}!] ¡Fantástico, sigue así!',
  },
  sport => sports[sport].scoreWord,
  { football: 'Gooool' },
);

export const es = {
  code: 'es',
  nativeName: 'Español',
  dir: 'ltr',
  ui: {
    appTitle: 'Sports Caller',
    sportLabel: 'Deporte',
    languageLabel: 'Idioma',
    step1Title: 'Partido y jugadores',
    step1Hint: 'Introduce los equipos y añade a tus jugadores.',
    step2Title: 'Anuncios',
    step2Hint: 'Elige lo que dice el locutor.',
    step3Title: 'Partido',
    step3Hint: 'Empieza el partido y toca para anunciar jugadores y goles.',
    step4Title: 'Sonidos y voz',
    step4Hint: 'Elige una voz y sonidos divertidos.',
    step5Title: 'Guardar y privacidad',
    step5Hint: 'Tus datos se quedan en este dispositivo.',
  },
  sports,
  staffHeadings: ['Entrenador', 'Entrenador asistente', 'Staff', 'Oficiales del equipo'],
  templates,
} satisfies LanguagePack;
