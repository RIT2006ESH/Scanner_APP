import { Finding } from '../../types';

// Backed by llama.rn (React Native binding for llama.cpp / GGUF models).
// One session is loaded per scan batch, not per file — see orchestrator.ts.

let sessionLoaded = false;

export async function loadModel(): Promise<void> {
  // TODO: llama.rn initLlama() with a quantized GGUF model bundled or
  // downloaded on-demand into app storage
  sessionLoaded = true;
}

export async function unloadModel(): Promise<void> {
  // TODO: release the llama.rn context
  sessionLoaded = false;
}

export async function classifyBatch(
  chunks: { text: string; filePath: string }[],
): Promise<Finding[]> {
  if (!sessionLoaded) {
    throw new Error('SLM session not loaded — call loadModel() first');
  }
  // TODO: run each chunk through llama.rn completion, parse classification
  return [];
}
