import type { RespellTable } from './index';

/**
 * IPA (as eSpeak NG writes it, length mark attached: "aː") -> German spellings, the
 * most likely first, at most 3. Tone digits (Vietnamese, Chinese) are dropped.
 */
export const de: RespellTable = {
  p: ['p'], b: ['b'], t: ['t'], d: ['d'], k: ['k', 'ck'], g: ['g'], ɡ: ['g'], f: ['f'], v: ['w', 'v'], w: ['u', 'w'],
  z: ['s'], s: ['ss', 's', 'ß'], ʃ: ['sch'], ʒ: ['sch', 'j'], x: ['ch', 'h', 'k'], ç: ['ch', 'sch'], h: ['h'],
  m: ['m'], n: ['n'], l: ['l'], r: ['r'], ɹ: ['r'], ɾ: ['r'], ʁ: ['r'], j: ['j'], ŋ: ['ng'], ɲ: ['nj', 'nn'],
  ɕ: ['sch', 'sj', 'ch'], tɕ: ['tsch', 'tj', 'tsj'], tʃ: ['tsch'], dʒ: ['dsch'], ts: ['z'], θ: ['s', 'ss'], ð: ['s', 'd'],
  a: ['a'], 'aː': ['aa', 'ah', 'a'], ɑ: ['a'], 'ɑː': ['a', 'ah'], ɐ: ['a', 'er'], ʌ: ['a'], æ: ['ä', 'e'],
  ɛ: ['e', 'ä'], 'ɛː': ['ä', 'äh'], e: ['e', 'ee'], 'eː': ['eh', 'ee', 'e'], ə: ['e'], ɜ: ['e', 'ö'], 'ɜː': ['ö', 'e'],
  ɪ: ['i'], i: ['i', 'ie'], 'iː': ['ie', 'i', 'ih'], ɔ: ['o'], 'ɔː': ['o', 'oh'], o: ['o'], 'oː': ['oh', 'oo', 'o'],
  ɒ: ['o'], ʊ: ['u'], u: ['u'], 'uː': ['u', 'uh'], œ: ['ö'], ø: ['ö'], 'øː': ['ö', 'öh'], y: ['ü'], 'yː': ['ü', 'üh'], ʏ: ['ü'],
  aɪ: ['ei', 'ai'], aʊ: ['au'], ɔɪ: ['eu', 'oi'], eɪ: ['ei', 'ee'], oʊ: ['o', 'oh'],
  '1': [''], '2': [''], '3': [''], '4': [''], '5': [''], '6': [''], '7': [''],
};
