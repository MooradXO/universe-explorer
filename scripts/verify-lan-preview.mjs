import http from 'node:http';
import assert from 'node:assert/strict';
const host=process.argv[2]||'192.168.100.182';
const cases=[
  ['game','/',{},'GET',200],
  ['visual review','/visual-lab.html',{},'GET',200],
  ['review link navigation','/visual-lab.html?quality=LOW',{'sec-fetch-site':'cross-site','sec-fetch-mode':'navigate'},'GET',200],
  ['foreign API','/__catalog/manifest',{'sec-fetch-site':'cross-site','sec-fetch-mode':'cors'},'GET',403],
  ['foreign origin','/visual-lab.html',{origin:'https://example.com'},'GET',403],
  ['read-only','/visual-lab.html',{},'POST',405],
];
for(const [name,path,headers,method,expected] of cases){
  const status=await new Promise((resolve,reject)=>{
    const req=http.request({hostname:host,port:3002,path,headers,method},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});
    req.on('error',reject);req.setTimeout(10000,()=>req.destroy(new Error('timeout')));req.end();
  });
  assert.equal(status,expected,name);console.log(`${name}: ${status} PASS`);
}
