/** Reads a Blob; `new Response` covers environments whose Blob has no arrayBuffer()/text(). */
export function blobBytes(b: Blob): Promise<ArrayBuffer> {
  return typeof b.arrayBuffer === 'function' ? b.arrayBuffer() : new Response(b).arrayBuffer();
}

export function blobText(b: Blob): Promise<string> {
  return typeof b.text === 'function' ? b.text() : new Response(b).text();
}
