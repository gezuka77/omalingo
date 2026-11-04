'use strict';
const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
function plain(value){
 return String(value??'').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'')
  .replace(/<br\s*\/?>|<\/(?:div|p|li)>/gi,'\n').replace(/<[^>]*>/g,'')
  .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(entity,name)=>{
   if(!name.startsWith('#'))return entities[name.toLowerCase()];
   const number=name[1].toLowerCase()==='x'?parseInt(name.slice(2),16):Number(name.slice(1));
   return number>0&&number<=0x10ffff&&!(number>=0xd800&&number<=0xdfff)?String.fromCodePoint(number):entity;
  }).replace(/\r\n?/g,'\n').trim();
}

module.exports={plain};
