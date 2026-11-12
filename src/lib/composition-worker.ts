import { packComposition } from './composition';
import type { CompositionParams } from './composition-types';
self.onmessage = (event: MessageEvent<{ params: CompositionParams; refill: boolean }>) => {
  try {
    const result = packComposition(event.data.params, event.data.refill,
      count => self.postMessage({ type: 'progress', count }));
    self.postMessage({ type: 'result', result });
  } catch (error) { self.postMessage({ type: 'error', error: String(error) }); }
};
