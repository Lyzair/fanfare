import { render } from 'preact';
import './ui/styles.css';
import { App } from './ui/App';
import { registerServiceWorker } from './pwa/register';
import { installTtsTestHook } from './tts/testHook';

installTtsTestHook();
render(<App />, document.getElementById('app')!);
registerServiceWorker();
