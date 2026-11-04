'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const audio=require('../frontend/audio-playback.js');
let gesture=false;
class Media{
 constructor(){this.attributes={};this.allowed=false;this.calls=0;this.pauses=0;}
 get src(){return this.attributes.src||'';}set src(value){this.attributes.src=value;}
 getAttribute(k){return this.attributes[k]??null;}setAttribute(k,v){this.attributes[k]=v;}removeAttribute(k){delete this.attributes[k];}
 pause(){this.pauses++;}
 play(){this.calls++;if(gesture)this.allowed=true;return this.allowed?Promise.resolve():Promise.reject(Object.assign(Error('Tap required'),{name:'NotAllowedError'}));}
}
test('a synchronous tap primes the same element before asynchronous generation returns',async()=>{
 const element=new Media();gesture=true;audio.prime(element);assert.equal(element.calls,1);gesture=false;
 await new Promise(resolve=>setImmediate(resolve));assert.equal(element.src,'');
 element.src='https://audio.example.com/word.wav';assert.equal(await audio.play(element),true);assert.equal(element.calls,2);
});
test('blocked delayed playback offers an explicit retry without recreating or losing audio',async()=>{
 const element=new Media();element.src='https://audio.example.com/word.wav';let retry;
 assert.equal(await audio.play(element,{onBlocked:f=>retry=f}),false);assert.equal(typeof retry,'function');assert.equal(element.src,'https://audio.example.com/word.wav');
 gesture=true;const promise=retry();gesture=false;assert.equal(await promise,true);assert.equal(element.calls,2);
});
test('switching words invalidates a pending retry and other media errors remain visible',async()=>{
 const element=new Media();element.src='https://audio.example.com/first.wav';let retry;
 await audio.play(element,{onBlocked:f=>retry=f});element.src='https://audio.example.com/second.wav';assert.equal(await retry(),false);assert.equal(element.calls,1);
 element.play=()=>Promise.reject(Object.assign(Error('Unsupported audio'),{name:'NotSupportedError'}));await assert.rejects(audio.play(element),/Unsupported audio/);
});
test('priming never pauses a real source assigned while the initial play promise settles',async()=>{
 const element=new Media();gesture=true;audio.prime(element);gesture=false;element.src='https://audio.example.com/ready.wav';
 await new Promise(resolve=>setImmediate(resolve));assert.equal(element.src,'https://audio.example.com/ready.wav');assert.equal(element.pauses,0);
});
