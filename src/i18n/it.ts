// Translation: machine-assisted — native speakers, please review.
import type { LanguagePack } from './index';
import type { SportId } from '../domain/model';
import { makeTemplates } from './templates';

const sports: Record<SportId, { name: string; scoreWord: string; positions: string[] }> = {
  football: { name: 'Calcio', scoreWord: 'Gol', positions: ['Portiere', 'Difesa', 'Centrocampo', 'Attacco'] },
  handball: { name: 'Pallamano', scoreWord: 'Gol', positions: ['Portiere', 'Ala sinistra', 'Terzino sinistro', 'Centrale', 'Terzino destro', 'Ala destra', 'Pivot'] },
  basketball: { name: 'Pallacanestro', scoreWord: 'Canestro', positions: ['Playmaker', 'Guardia', 'Ala piccola', 'Ala grande', 'Centro'] },
  volleyball: { name: 'Pallavolo', scoreWord: 'Punto', positions: ['Palleggiatore', 'Schiacciatore', 'Opposto', 'Centrale', 'Libero'] },
  fieldhockey: { name: 'Hockey su prato', scoreWord: 'Gol', positions: ['Portiere', 'Difesa', 'Centrocampo', 'Attacco'] },
  icehockey: { name: 'Hockey su ghiaccio', scoreWord: 'Gol', positions: ['Portiere', 'Difensore', 'Centro', 'Ala'] },
  floorball: { name: 'Floorball', scoreWord: 'Gol', positions: ['Portiere', 'Difesa', 'Centrocampo', 'Attacco'] },
};

const templates = makeTemplates(
  {
    intro: 'Ciao a tutti e benvenuti[ alla partita di oggi contro {opponent}]! Ecco la formazione[ di {home}]! Facciamo insieme una partita corretta e divertente!',
    field: 'E ora[ nel ruolo di {position}][, con il numero {number}]: {name}! Divertiti e dai il massimo!',
    bench: 'Pronto a entrare dalla panchina: {name}! Che bello averti con noi!',
    score: '{score}[ per {home}]![ Ben fatto, {name}!] Fantastico, continua così!',
  },
  sport => sports[sport].scoreWord,
  { football: 'Gooool' },
);

export const it = {
  code: 'it',
  nativeName: 'Italiano',
  dir: 'ltr',
  ui: {
    appTitle: 'Sports Caller',
    sportLabel: 'Sport',
    languageLabel: 'Lingua',
    step1Title: 'Partita e giocatori',
    step1Hint: 'Inserisci le squadre e aggiungi i tuoi giocatori.',
    step2Title: 'Annunci',
    step2Hint: 'Scegli cosa dice lo speaker.',
    step3Title: 'Partita',
    step3Hint: 'Avvia la partita e tocca per annunciare giocatori e gol.',
    step4Title: 'Suoni e voce',
    step4Hint: 'Scegli una voce e suoni divertenti.',
    step5Title: 'Salvataggio e privacy',
    step5Hint: 'I tuoi dati restano su questo dispositivo.',
    saveUnavailable: "Il salvataggio su questo dispositivo non è disponibile — usa Esporta per conservare la tua squadra.",
    matchTitle: "Partita",
    homeTeam: "Squadra di casa",
    opponent: "Avversario",
    matchHint: "Questi compilano {home} e {opponent} negli annunci — di solito l'unica cosa da cambiare per una nuova partita.",
    pasteLabel: "Incolla o scrivi un elenco di giocatori",
    pastePlaceholder: "Un nome per riga — es. «7 Lea Müller»",
    addToField: "Aggiungi",
    addToBench: "Aggiungi in panchina",
    singleLabel: "Aggiungi un giocatore",
    singlePlaceholder: "Nome, poi Invio",
    fieldList: "In campo",
    benchList: "Panchina",
    emptyList: "Ancora nessuno.",
    shirtNumber: "Numero di maglia",
    playerName: "Nome",
    position: "Ruolo",
    usePositions: "Usa i ruoli",
    toBench: "In panchina",
    toField: "In campo",
    moveUp: "Su",
    moveDown: "Giù",
    remove: "Rimuovi",
    removedPlayer: "{name} rimosso",
    undo: "Annulla",
    fieldCount: "{count} / {max} in campo",
    fussballTitle: "Vieni da fussball.de?",
    fussballHelp: "Apri la pagina della tua squadra su fussball.de, seleziona l'elenco della rosa, copialo e incollalo nel campo qui sopra. Numeri di maglia, ruoli e nomi nel formato «Cognome, Nome» vengono riconosciuti automaticamente. Questa app non si collega mai da sola a fussball.de.",
  },
  sports,
  staffHeadings: ['Allenatore', 'Vice allenatore', 'Staff', 'Dirigenti della squadra'],
  templates,
} satisfies LanguagePack;
