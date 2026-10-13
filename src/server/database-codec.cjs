function encode(value) {
  if (value instanceof Uint8Array) return { $bytes: Buffer.from(value).toString('base64') };
  if (typeof value === 'bigint') return { $integer: String(value) };
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,encode(v)]));
  return value;
}
function decode(value) {
  if (value && typeof value === 'object') {
    if ('$bytes' in value) return Buffer.from(value.$bytes,'base64');
    if ('$integer' in value) return BigInt(value.$integer);
    if (Array.isArray(value)) return value.map(decode);
    return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,decode(v)]));
  }
  return value;
}
module.exports={encode,decode};
