
let extractor: any = null;

export default async function getEmbedding(text: string): Promise<number[] | null> {

  try {
    if (!extractor) {
      const { pipeline } = await import('@xenova/transformers'); 
      extractor = await pipeline('feature-extraction', 'Xenova/bge-small-en-v1.5');
    }

    const output = await extractor(text, { pooling: 'mean', normalize: true });

    // Handle nested array from Xenova
    const data = output.data;
    if (Array.isArray(data)) {
      return Array.isArray(data[0]) ? data[0] : data; // Flatten if [[...]]
    }

    return Array.from(data); // Fallback, rarely needed
  } catch (err) {
    console.error('Local embedding error:', err);
    return null;
  }
}
