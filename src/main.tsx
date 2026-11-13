import { render } from 'preact';
import './ui/styles.css';
import { App } from './ui/App';
import { installTtsTestHook } from './tts/testHook';

installTtsTestHook();
render(<App />, document.getElementById('app')!);
