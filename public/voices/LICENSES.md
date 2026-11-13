# Voice and speech-runtime licences

Sports Caller's own code is MIT-licensed. The files below are third-party works
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
| `piper/piper_phonemize.wasm`, `piper/piper_phonemize.data` | [`@diffusionstudio/piper-wasm@1.0.0`](https://github.com/diffusionstudio/piper-wasm) (build of [piper-phonemize](https://github.com/rhasspy/piper-phonemize)) | Package: MIT. Contains [eSpeak NG](https://github.com/espeak-ng/espeak-ng) code and data, which are GPL-3.0-or-later; their source is available at that link. |
| bundled JS | [`@mintplex-labs/piper-tts-web@1.0.5`](https://github.com/Mintplex-Labs/piper-tts-web) (patched, see `patches/`) | MIT |
