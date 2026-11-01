export async function requestBody(req, limit=3800000) {
  if(req.body!==undefined) {
    const value=typeof req.body==='string'?JSON.parse(req.body):req.body;
    if(Buffer.byteLength(JSON.stringify(value)||'')>limit)throw Error('Request too large');
    return value;
  }
  let size=0;const parts=[];
  for await(const part of req){size+=part.length;if(size>limit)throw Error('Request too large');parts.push(Buffer.from(part));}
  return parts.length?JSON.parse(Buffer.concat(parts).toString('utf8')):{};
}
