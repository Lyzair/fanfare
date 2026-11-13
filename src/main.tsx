import { render } from 'preact';
import { App } from './ui/App';
import { installTtsTestHook } from './tts/testHook';

installTtsTestHook();
render(<App />, document.getElementById('app')!);
