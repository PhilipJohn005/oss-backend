let extractor: any = null;

// Modified to handle both single and batch inputs
export default async function getEmbedding(text: string | string[]): Promise<number[] | number[][] | null> {
  try {
    if (!extractor) {
      const { pipeline } = await import('@xenova/transformers');
      extractor = await pipeline('feature-extraction', 'Xenova/bge-small-en-v1.5', {
        quantized: true, // Use quantized model for faster loading
      });
    }

    const isBatch = Array.isArray(text);
    const inputs = isBatch ? text : [text];
    
    const output = await extractor(inputs, {
      pooling: 'mean',
      normalize: true,
      batch_size: inputs.length // Process as single batch
    });

    // Handle output format
    const results = output.tolist();
    return isBatch ? results : results[0];
    
  } catch (err) {
    console.error('Embedding error:', err);
    return null;
  }
}