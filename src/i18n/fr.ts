// Translation: machine-assisted — native speakers, please review.
import type { LanguagePack } from './index';
import type { SportId } from '../domain/model';
import { makeTemplates } from './templates';

const sports: Record<SportId, { name: string; scoreWord: string; positions: string[] }> = {
  football: { name: 'Football', scoreWord: 'But', positions: ['Gardien', 'Défense', 'Milieu', 'Attaque'] },
  handball: { name: 'Handball', scoreWord: 'But', positions: ['Gardien', 'Ailier gauche', 'Arrière gauche', 'Demi-centre', 'Arrière droit', 'Ailier droit', 'Pivot'] },
  basketball: { name: 'Basket-ball', scoreWord: 'Panier', positions: ['Meneur', 'Arrière', 'Ailier', 'Ailier fort', 'Pivot'] },
  volleyball: { name: 'Volley-ball', scoreWord: 'Point', positions: ['Passeur', 'Réceptionneur-attaquant', 'Pointu', 'Central', 'Libéro'] },
  fieldhockey: { name: 'Hockey sur gazon', scoreWord: 'But', positions: ['Gardien', 'Défense', 'Milieu', 'Attaque'] },
  icehockey: { name: 'Hockey sur glace', scoreWord: 'But', positions: ['Gardien', 'Défenseur', 'Centre', 'Ailier'] },
  floorball: { name: 'Floorball', scoreWord: 'But', positions: ['Gardien', 'Défense', 'Milieu', 'Attaque'] },
};

const templates = makeTemplates(
  {
    intro: "Bonjour à tous et bienvenue[ au match d'aujourd'hui contre {opponent}] ! Voici la composition[ de {home}] ! Passons ensemble un match fair-play et amusant !",
    field: 'Et maintenant[ au poste de {position}][, numéro {number}] : {name} ! Amuse-toi bien et donne tout !',
    bench: "Prêt à entrer en jeu depuis le banc : {name} ! Super de t'avoir avec nous !",
    score: '{score}[ pour {home}] ![ Bien joué, {name} !] Fantastique, continue comme ça !',
  },
  sport => sports[sport].scoreWord,
  { football: 'Buuut' },
);

export const fr = {
  code: 'fr',
  nativeName: 'Français',
  dir: 'ltr',
  ui: {
    appTitle: 'Sports Caller',
    sportLabel: 'Sport',
    languageLabel: 'Langue',
    step1Title: 'Match et joueurs',
    step1Hint: 'Saisis les équipes et ajoute tes joueurs.',
    step2Title: 'Annonces',
    step2Hint: 'Choisis ce que dit le speaker.',
    step3Title: 'Match en direct',
    step3Hint: 'Lance le match et touche pour annoncer les joueurs et les buts.',
    step4Title: 'Sons et voix',
    step4Hint: 'Choisis une voix et des sons amusants.',
    step5Title: 'Sauvegarde et confidentialité',
    step5Hint: 'Tes données restent sur cet appareil.',
  },
  sports,
  staffHeadings: ['Entraîneur', 'Entraîneur adjoint', 'Encadrement', "Officiels de l'équipe"],
  templates,
} satisfies LanguagePack;
