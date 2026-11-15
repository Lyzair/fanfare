# Voice and speech-runtime licences

Fanfare's own code is MIT-licensed. The files below are third-party works
that `scripts/fetch-assets.mjs` downloads or copies into `public/` at build time
(they are not committed to the repository) and that the published site serves
from its own origin. The page never contacts any other server.

## Voices

All voices are [Piper](https://github.com/rhasspy/piper) models (VITS, ONNX)
trained by the Piper project (Michael Hansen / rhasspy) and others. They are
downloaded from the 2024 snapshot that `@mintplex-labs/piper-tts-web` was built
against:
`https://huggingface.co/diffusionstudio/piper-voices/resolve/main/<path>`
(a mirror of [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices),
whose repository metadata declares `license: mit`). Each voice directory also
contains the upstream `MODEL_CARD`. The licence listed is the licence of the
training dataset as stated in the model card (the cards state no separate
licence for the weights).

| Lang | Voice id | File (under `voices/`) | Size (bytes) | Dataset | Licence |
|---|---|---|---:|---|---|
| de | `de_DE-thorsten-medium` | `de/de_DE/thorsten/medium/` | 63,201,294 | [Thorsten-Voice](https://github.com/thorstenMueller/Thorsten-Voice) | CC0 1.0 |
| en | `en_US-ljspeech-medium` | `en/en_US/ljspeech/medium/` | 63,531,379 | [LJ Speech](https://keithito.com/LJ-Speech-Dataset/) | Public domain |
| fr | `fr_FR-siwis-medium` | `fr/fr_FR/siwis/medium/` | 63,201,294 | [SIWIS French Speech Synthesis Database](https://datashare.is.ed.ac.uk/handle/10283/2353) | CC BY 4.0 (attribution below) |
| es | `es_ES-davefx-medium` | `es/es_ES/davefx/medium/` | 63,201,294 | [NabuCasa voice-datasets](https://github.com/NabuCasa/voice-datasets) | CC0 1.0 |
| it | `it_IT-paola-medium` | `it/it_IT/paola/medium/` | 63,511,038 | [paolapersico1/Voice-Dataset-Italian](https://huggingface.co/datasets/paolapersico1/Voice-Dataset-Italian) | CC0 1.0 (declared on the dataset page; the model card says "See URL") |
| nl | `nl_NL-mls-medium` | `nl/nl_NL/mls/medium/` | 76,584,246 | [Multilingual LibriSpeech (MLS), OpenSLR 94](http://openslr.org/94/) | CC BY 4.0 (attribution below) |
| pl | `pl_PL-mc_speech-medium` | `pl/pl_PL/mc_speech/medium/` | 63,201,294 | [The MC Speech Dataset](https://www.kaggle.com/datasets/czyzi0/the-mc-speech-dataset) | CC0 1.0 |
| tr | `tr_TR-fettah-medium` | `tr/tr_TR/fettah/medium/` | 63,201,294 | [NabuCasa voice-datasets](https://github.com/NabuCasa/voice-datasets) | CC0 1.0 |
| uk | `uk_UA-ukrainian_tts-medium` | `uk/uk_UA/ukrainian_tts/medium/` | 76,735,663 | [NabuCasa voice-datasets](https://github.com/NabuCasa/voice-datasets) | CC0 1.0 |
| ar | `ar_JO-kareem-medium` | `ar/ar_JO/kareem/medium/` | 63,201,294 | [AliMokhammad/arabicttstrain](https://github.com/AliMokhammad/arabicttstrain/) | **Unclear** (see below) |

Total voice data: 659,570,090 bytes (about 660 MB). Each user downloads only
the voice they use (about 63-77 MB), once; it is then kept in the browser's
origin-private storage.

### Attribution (CC BY 4.0)

- **French voice `fr_FR-siwis-medium`** is trained on *The SIWIS French Speech
  Synthesis Database* by Pierre-Edouard Honnet, Alexandros Lazaridis, Philip N.
  Garner and Junichi Yamagishi (Idiap Research Institute / University of
  Edinburgh), <https://datashare.is.ed.ac.uk/handle/10283/2353>, licensed under
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The voice model is
  a derived work (fine-tuned Piper model by the Piper project); no other
  changes were made.
- **Dutch voice `nl_NL-mls-medium`** is trained on *Multilingual LibriSpeech
  (MLS)* by Vineel Pratap, Qiantong Xu, Anuroop Sriram, Gabriel Synnaeve and
  Ronan Collobert (Facebook AI Research), derived from LibriVox recordings,
  <http://openslr.org/94/>, licensed under
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The voice model is
  a derived work (Piper model trained from scratch by the Piper project); the
  app uses speaker 0 only; no other changes were made.

### Arabic voice: licence unclear

`ar_JO-kareem-medium`: unclear — model card says 'See URL', no licence found at
source; included at the maintainer's decision, will be replaced if a clearly
licensed Arabic voice appears. (The linked GitHub repository
<https://github.com/AliMokhammad/arabicttstrain/> declares no licence. It is
the only Arabic voice the Piper library supports.)

## Speech runtime (copied from npm packages)

| Directory | Source package | Licence |
|---|---|---|
| `ort/ort-wasm*.wasm` | [`onnxruntime-web@1.18.0`](https://github.com/microsoft/onnxruntime) | MIT (Microsoft) |
| `piper/piper_phonemize.wasm`, `piper/piper_phonemize.data` | [`@diffusionstudio/piper-wasm@1.0.0`](https://github.com/diffusionstudio/piper-wasm) (build of [piper-phonemize](https://github.com/rhasspy/piper-phonemize)) | Package: MIT. Contains eSpeak NG code and data (see below). |
| bundled JS | [`@mintplex-labs/piper-tts-web@1.0.5`](https://github.com/Mintplex-Labs/piper-tts-web) (patched, see `patches/`) | MIT |

The copyright and permission notices of these packages and of the other
libraries bundled into the app (Preact, fflate, idb-keyval, QR Code Generator),
together with Fanfare's own MIT licence, are served with this site:
[`../licenses/THIRD-PARTY-NOTICES.txt`](../licenses/THIRD-PARTY-NOTICES.txt).

### eSpeak NG (GPL-3.0-or-later)

`piper/piper_phonemize.wasm` and `piper/piper_phonemize.data` contain
[eSpeak NG](https://github.com/espeak-ng/espeak-ng) code and data, which are
licensed under the **GNU General Public License, version 3 or (at your option)
any later version (GPL-3.0-or-later)**. The full licence text is served with
this site: [`../licenses/GPL-3.0.txt`](../licenses/GPL-3.0.txt).

Corresponding source (looked up on 2026-11-15):

- **Object code as shipped.** The two files are copied unchanged from the npm
  package `@diffusionstudio/piper-wasm` version 1.0.0:
  <https://registry.npmjs.org/@diffusionstudio/piper-wasm/-/piper-wasm-1.0.0.tgz>
  (sha1 `42c15fec08bf8af3f167d5c5285a61cd0f789120`).
- **Where that package was published from.** Commit
  [`69522c832bd52d7c16389e9a8aee568065027689`](https://github.com/diffusionstudio/piper-wasm/tree/69522c832bd52d7c16389e9a8aee568065027689)
  of <https://github.com/diffusionstudio/piper-wasm> (the npm metadata names the
  repository's earlier address `github.com/diffusion-studio/piper-wasm`, which
  redirects there). The repository has no tags. It holds the built files and, in
  its `README.md`, the build steps (Emscripten 3.1.47, "as of June 2024").
- **eSpeak NG program code** (inside `piper_phonemize.wasm`): revision
  [`0f65aa301e0d6bae5e172cc74197d32a6182200f`](https://github.com/rhasspy/espeak-ng/tree/0f65aa301e0d6bae5e172cc74197d32a6182200f)
  of <https://github.com/rhasspy/espeak-ng> (a fork of
  <https://github.com/espeak-ng/espeak-ng>). This revision is pinned by the
  `CMakeLists.txt` of the piper-phonemize revision below.
- **eSpeak NG data** (`piper_phonemize.data`, the `espeak-ng-data` directory):
  the upstream build steps do not pin a revision; they clone the default branch
  of <https://github.com/rhasspy/espeak-ng>. That branch has not changed since
  November 2023, so the revision at build time was
  [`8593723f10cfd9befd50de447f14bf0a9d2a14a4`](https://github.com/rhasspy/espeak-ng/tree/8593723f10cfd9befd50de447f14bf0a9d2a14a4).
- **piper-phonemize** (MIT, Copyright (c) 2023 Michael Hansen): the build steps
  clone the default branch `wide.video` of
  <https://github.com/wide-video/piper-phonemize> (a fork of
  <https://github.com/rhasspy/piper-phonemize>) without pinning; that branch has
  not changed since April 2024, so the revision at build time was
  [`cfff8e52ebaea37c7e953ae2d06b174acb827ac4`](https://github.com/wide-video/piper-phonemize/tree/cfff8e52ebaea37c7e953ae2d06b174acb827ac4).

The two unpinned revisions are derived from the repositories' histories, not
stated by the package itself.

Fanfare's own code is not a derivative of eSpeak NG; it loads the phonemizer as
a separate WebAssembly module. The GPL applies to the eSpeak NG components.
