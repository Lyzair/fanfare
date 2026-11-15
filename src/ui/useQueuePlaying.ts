import { useEffect, useState } from 'preact/hooks';
import type { AudioQueue } from '../audio/queue';

/** Whether the queue is playing right now; re-renders the component when that changes. */
export function useQueuePlaying(queue: Pick<AudioQueue, 'playing' | 'subscribe'> | undefined): boolean {
  const [playing, setPlaying] = useState(queue?.playing ?? false);
  useEffect(() => {
    if (!queue) return;
    setPlaying(queue.playing);
    return queue.subscribe(setPlaying);
  }, [queue]);
  return playing;
}
