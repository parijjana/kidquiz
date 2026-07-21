/**
 * Curated, hardcoded model catalog — see ARCHITECTURE.md §8.
 *
 * Each `hfUrl` is the canonical `huggingface.co/<repo>/resolve/main/<file>` form and
 * was verified against the HuggingFace model API (file exists, exact filename, real
 * `fileSizeBytes`). Provenance for each entry is noted inline.
 *
 * Downloads are performed by node-llama-cpp's `createModelDownloader`, which also
 * transparently handles GGUF files that are split into multiple parts (the Qwen 7B
 * entry below): pointing the downloader at the first `-00001-of-000NN.gguf` part makes
 * it fetch every part into the same directory.
 */

import type { ModelCatalogEntry } from '@shared/types'

export const MODEL_CATALOG: ModelCatalogEntry[] = [
  {
    // Official Qwen repo. Single-file GGUF.
    // Verified: huggingface.co/api/models/Qwen/Qwen2.5-1.5B-Instruct-GGUF
    id: 'qwen2.5-1.5b-q4',
    displayName: 'Recommended — fast and reliable on most laptops',
    description:
      'Qwen2.5 1.5B Instruct (Q4_K_M). The recommended everyday choice: quick to download, fast ' +
      'to run on most laptops, and dependable at producing well-formed quiz questions.',
    fileSizeBytes: 1_117_320_736,
    minRamGB: 4,
    hfUrl:
      'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    recommended: true
  },
  {
    // Official Qwen repo. GGUF is split into two parts; hfUrl points at part 1 of 2 and
    // createModelDownloader fetches both. fileSizeBytes is the combined size of both parts.
    // Verified: huggingface.co/api/models/Qwen/Qwen2.5-7B-Instruct-GGUF
    id: 'qwen2.5-7b-q4',
    displayName: 'Best questions — needs a newer laptop (8 GB+ free memory)',
    description:
      'Qwen2.5 7B Instruct (Q4_K_M). Produces the best questions but needs a newer laptop with ' +
      'plenty of free memory (8 GB+). Slower to run and larger to download.',
    fileSizeBytes: 4_683_073_632,
    minRamGB: 16,
    hfUrl:
      'https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/main/qwen2.5-7b-instruct-q4_k_m-00001-of-00002.gguf',
    recommended: false
  }
]

/** Look up a catalog entry by its `id`. Returns `undefined` if the id is unknown. */
export function getCatalogEntry(modelId: string): ModelCatalogEntry | undefined {
  return MODEL_CATALOG.find((entry) => entry.id === modelId)
}

/**
 * The on-disk filename for a catalog entry — the last path segment of its `hfUrl`.
 * For split-GGUF entries this is the entrypoint (`-00001-of-000NN.gguf`) part, whose
 * presence indicates the model has been downloaded.
 */
export function modelFileName(entry: ModelCatalogEntry): string {
  const segments = entry.hfUrl.split('/')
  return segments[segments.length - 1]
}
