const fs = require('node:fs');
const path = require('node:path');
const { Problem } = require('./service.cjs');
const assets = {
  '/': ['index.html','text/html; charset=utf-8'],
  '/app.js': ['app.js','text/javascript; charset=utf-8'],
  '/styles.css': ['styles.css','text/css; charset=utf-8'],
};
function handler(service,{assetsDir=path.resolve(__dirname,'../live')}={}) {
  const cachedAssets = Object.fromEntries(Object.entries(assets).map(([url,[file,type]]) =>
    [url,{type,content:fs.readFileSync(path.join(assetsDir,file))}]));
  return async (req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const url=new URL(req.url,'http://localhost');
      if(url.pathname==='/health'&&req.method==='GET'){res.setHeader('Content-Type','text/plain');res.end('ok');return;}
      if(req.method==='GET'&&assets[url.pathname]) {
        const {type,content}=cachedAssets[url.pathname];res.setHeader('Content-Type',type);res.end(content);return;
      }
      if(!url.pathname.startsWith('/api/')){res.statusCode=404;res.end('Not found');return;}
      let body={};
      if(['POST','PUT','DELETE'].includes(req.method)) {
        if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw new Problem(415,'Use application/json.');
        const max=url.pathname==='/api/documents'?14*1024*1024+1000:256*1024;
        const chunks=[];let size=0;
        for await(const chunk of req){size+=chunk.length;if(size>max)throw new Problem(413,'Request is too large.');chunks.push(chunk);}
        try {body=JSON.parse(Buffer.concat(chunks).toString()||'{}');}catch{throw new Problem(400,'Invalid JSON.');}
      }
      const result=await service.dispatch({method:req.method,path:url.pathname,body,cookie:req.headers.cookie,requestOrigin:req.headers.origin,ip:req.socket?.remoteAddress||'unknown'});
      res.statusCode=result.status;
      if(result.cookie)res.setHeader('Set-Cookie',result.cookie);
      if(result.binary) {
        res.setHeader('Content-Type','application/octet-stream');
        res.setHeader('Content-Disposition',`attachment; filename="milo-document"; filename*=UTF-8''${encodeURIComponent(result.name).replace(/'/g,'%27')}`);
        res.end(Buffer.from(result.binary));
      } else {res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(result.body));}
    } catch(error) {
      res.statusCode=error instanceof Problem?error.status:500;
      res.setHeader('Content-Type','application/json; charset=utf-8');
      res.end(JSON.stringify({error:error instanceof Problem?error.message:'The server could not complete this request.'}));
      // Deliberately omit request contents, cookies, tokens and private records from logs.
      if(!(error instanceof Problem))console.error('Milo request failed:',error.code||error.name);
    }
  };
}
module.exports={handler};
