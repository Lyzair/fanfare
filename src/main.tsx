import { render } from 'preact';
import './ui/styles.css';
import { App } from './ui/App';
import RemoteApp from './ui/RemoteApp';
import { registerServiceWorker } from './pwa/register';
import { installTtsTestHook } from './tts/testHook';

// A phone opens the same page with #remote: the soundboard, which only sends commands to the laptop.
if (location.hash === '#remote') {
  render(<RemoteApp />, document.getElementById('app')!);
} else {
  installTtsTestHook();
  render(<App />, document.getElementById('app')!);
  registerServiceWorker();
}
