import type { RespellTable } from './index';

/**
 * IPA (as eSpeak NG writes it, length mark attached: "aː") -> English spellings, the
 * most likely first, at most 3. Tone digits (Vietnamese, Chinese) are dropped.
 */
export const en: RespellTable = {
  p: ['p'], b: ['b'], t: ['t'], d: ['d'], k: ['k', 'c'], g: ['g'], ɡ: ['g'], f: ['f'], v: ['v'], w: ['w'],
  z: ['z', 's'], s: ['s', 'ss'], ʃ: ['sh'], ʒ: ['zh', 'j'], x: ['kh', 'h', 'k'], ç: ['h', 'sh'], h: ['h'],
  m: ['m'], n: ['n'], l: ['l'], r: ['r'], ɹ: ['r'], ɾ: ['r'], ʁ: ['r'], j: ['y'], ŋ: ['ng'], ɲ: ['ny', 'n'],
  ɕ: ['sh', 'sy'], tɕ: ['ch', 'tsy'], tʃ: ['ch'], dʒ: ['j'], ts: ['ts', 'tz'], θ: ['th'], ð: ['th'],
  a: ['a', 'ah'], 'aː': ['ah', 'a'], ɑ: ['ah', 'o'], 'ɑː': ['ah'], ɐ: ['uh', 'a'], ʌ: ['u', 'uh'], æ: ['a'],
  ɛ: ['e'], 'ɛː': ['air', 'e'], e: ['ay', 'e'], 'eː': ['ay', 'eh'], ə: ['uh', 'a'], ɜ: ['er', 'ur'], 'ɜː': ['er', 'ur'],
  ɪ: ['i', 'ih'], i: ['ee', 'i'], 'iː': ['ee', 'ea'], ɔ: ['o', 'aw'], 'ɔː': ['aw', 'or'], o: ['o', 'oh'], 'oː': ['oh', 'o'],
  ɒ: ['o'], ʊ: ['oo', 'u'], u: ['oo', 'u'], 'uː': ['oo', 'ew'], œ: ['er', 'ur'], ø: ['er'], 'øː': ['er'], y: ['ew', 'ee'],
  'yː': ['ew'], ʏ: ['ew'],
  aɪ: ['eye', 'y', 'igh'], aʊ: ['ow', 'ou'], ɔɪ: ['oy'], eɪ: ['ay'], oʊ: ['oh', 'o'],
  '1': [''], '2': [''], '3': [''], '4': [''], '5': [''], '6': [''], '7': [''],
};
