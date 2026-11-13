// Translation: machine-assisted — native speakers, please review.
import type { LanguagePack } from './index';
import type { SportId } from '../domain/model';
import { makeTemplates } from './templates';

const sports: Record<SportId, { name: string; scoreWord: string; positions: string[] }> = {
  football: { name: 'Piłka nożna', scoreWord: 'Gol', positions: ['Bramkarz', 'Obrońca', 'Pomocnik', 'Napastnik'] },
  handball: { name: 'Piłka ręczna', scoreWord: 'Bramka', positions: ['Bramkarz', 'Lewoskrzydłowy', 'Lewy rozgrywający', 'Środkowy rozgrywający', 'Prawy rozgrywający', 'Prawoskrzydłowy', 'Obrotowy'] },
  basketball: { name: 'Koszykówka', scoreWord: 'Kosz', positions: ['Rozgrywający', 'Rzucający obrońca', 'Niski skrzydłowy', 'Silny skrzydłowy', 'Środkowy'] },
  volleyball: { name: 'Siatkówka', scoreWord: 'Punkt', positions: ['Rozgrywający', 'Przyjmujący', 'Atakujący', 'Środkowy', 'Libero'] },
  fieldhockey: { name: 'Hokej na trawie', scoreWord: 'Gol', positions: ['Bramkarz', 'Obrońca', 'Pomocnik', 'Napastnik'] },
  icehockey: { name: 'Hokej na lodzie', scoreWord: 'Gol', positions: ['Bramkarz', 'Obrońca', 'Środkowy', 'Skrzydłowy'] },
  floorball: { name: 'Unihokej', scoreWord: 'Gol', positions: ['Bramkarz', 'Obrońca', 'Pomocnik', 'Napastnik'] },
};

const templates = makeTemplates(
  {
    intro: 'Cześć wszystkim i witamy[ na dzisiejszym meczu przeciwko {opponent}]! Oto skład[ drużyny {home}]! Zagrajmy razem fair i z uśmiechem!',
    field: 'A teraz[ na pozycji {position}][, z numerem {number}]: {name}! Dobrej zabawy i daj z siebie wszystko!',
    bench: 'Gotowy wejść z ławki: {name}! Fajnie, że jesteś z nami!',
    score: '{score}[ dla {home}]![ Brawo, {name}!] Fantastycznie, tak trzymaj!',
  },
  sport => sports[sport].scoreWord,
  { football: 'Goool' },
);

export const pl = {
  code: 'pl',
  nativeName: 'Polski',
  dir: 'ltr',
  ui: {
    appTitle: 'Sports Caller',
    sportLabel: 'Dyscyplina',
    languageLabel: 'Język',
    step1Title: 'Mecz i zawodnicy',
    step1Hint: 'Wpisz drużyny i dodaj swoich zawodników.',
    step2Title: 'Zapowiedzi',
    step2Hint: 'Wybierz, co mówi spiker.',
    step3Title: 'Gra',
    step3Hint: 'Rozpocznij mecz i dotykaj, by zapowiadać zawodników i gole.',
    step4Title: 'Dźwięki i głos',
    step4Hint: 'Wybierz głos i wesołe dźwięki.',
    step5Title: 'Zapis i prywatność',
    step5Hint: 'Twoje dane zostają na tym urządzeniu.',
    saveUnavailable: "Zapisywanie na tym urządzeniu jest niedostępne — użyj Eksportu, aby zachować swoją drużynę.",
    matchTitle: "Mecz",
    homeTeam: "Drużyna gospodarzy",
    opponent: "Rywal",
    matchHint: "Te pola uzupełniają {home} i {opponent} w komunikatach — zwykle jedyne, co trzeba zmienić przed nowym meczem.",
    pasteLabel: "Wklej lub wpisz listę zawodników",
    pastePlaceholder: "Jedno nazwisko w wierszu — np. „7 Lea Müller”",
    addToField: "Dodaj",
    addToBench: "Dodaj na ławkę",
    singleLabel: "Dodaj jednego zawodnika",
    singlePlaceholder: "Imię, potem Enter",
    fieldList: "Na boisku",
    benchList: "Ławka",
    emptyList: "Nikogo jeszcze nie ma.",
    shirtNumber: "Numer koszulki",
    playerName: "Imię i nazwisko",
    position: "Pozycja",
    usePositions: "Używaj pozycji",
    toBench: "Na ławkę",
    toField: "Na boisko",
    moveUp: "W górę",
    moveDown: "W dół",
    remove: "Usuń",
    removedPlayer: "Usunięto: {name}",
    undo: "Cofnij",
    fieldCount: "{count} / {max} na boisku",
    fussballTitle: "Dane z fussball.de?",
    fussballHelp: "Otwórz stronę własnej drużyny na fussball.de, zaznacz listę kadry, skopiuj ją i wklej do pola powyżej. Numery, pozycje i nazwiska w formacie „Nazwisko, Imię” są rozpoznawane automatycznie. Ta aplikacja nigdy sama nie łączy się z fussball.de.",
  },
  sports,
  staffHeadings: ['Trener', 'Asystent trenera', 'Obsługa', 'Działacze drużyny'],
  templates,
} satisfies LanguagePack;
