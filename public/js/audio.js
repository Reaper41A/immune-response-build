/* ============================================================================
   IMMUNE RESPONSE — audio (WebAudio synth, zero assets)
   Small, gentle synthesized cues. Muted state persists. The context is
   created lazily on the first user gesture to satisfy autoplay policies.
   ========================================================================== */
'use strict';

const AudioSys={
  ctx:null,gain:null,
  muted:localStorage.getItem('ir_mute')==='1',
  init(){
    if(this.ctx)return;
    try{
      const AC=window.AudioContext||window.webkitAudioContext;
      this.ctx=new AC();
      this.gain=this.ctx.createGain();
      this.gain.gain.value=this.muted?0:0.5;
      this.gain.connect(this.ctx.destination);
    }catch(_){/* no audio available — game still runs */}
  },
  setMuted(m){
    this.muted=m;localStorage.setItem('ir_mute',m?'1':'0');
    if(this.gain)this.gain.gain.value=m?0:0.5;
  },
  tone(f,type,dur,vol,slideTo,delay=0){
    if(!this.ctx||this.muted)return;
    const t=this.ctx.currentTime+delay;
    const o=this.ctx.createOscillator(),g=this.ctx.createGain();
    o.type=type;o.frequency.setValueAtTime(Math.max(30,f),t);
    if(slideTo)o.frequency.exponentialRampToValueAtTime(Math.max(30,slideTo),t+dur);
    g.gain.setValueAtTime(vol,t);
    g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.connect(g);g.connect(this.gain);
    o.start(t);o.stop(t+dur+0.02);
  },
  noise(dur,vol,freq=1200,delay=0){
    if(!this.ctx||this.muted)return;
    const t=this.ctx.currentTime+delay;
    const len=Math.max(1,Math.floor(this.ctx.sampleRate*dur));
    const buf=this.ctx.createBuffer(1,len,this.ctx.sampleRate);
    const d=buf.getChannelData(0);
    for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*(1-i/len);
    const src=this.ctx.createBufferSource();src.buffer=buf;
    const flt=this.ctx.createBiquadFilter();flt.type='lowpass';flt.frequency.value=freq;
    const g=this.ctx.createGain();g.gain.value=vol;
    src.connect(flt);flt.connect(g);g.connect(this.gain);
    src.start(t);
  },
  play(name){
    if(!this.ctx||this.muted)return;
    switch(name){
      case'shot_smg':this.tone(rand(700,780),'square',0.05,0.05,300);break;
      case'shot_beam':this.tone(1150,'sawtooth',0.08,0.05,500);break;
      case'shot_shotgun':this.noise(0.12,0.14,900);this.tone(190,'square',0.09,0.07,90);break;
      case'shot_blaster':this.tone(640,'triangle',0.07,0.07,900);break;
      case'shot_turret':this.tone(880,'triangle',0.05,0.04,600);break;
      case'hit':this.tone(rand(220,280),'square',0.04,0.04,140);break;
      case'crit':this.tone(520,'square',0.07,0.07,180);this.tone(760,'square',0.06,0.055,220,0.02);break;
      case'shield':this.tone(980,'sine',0.08,0.055,1180);break;
      case'kill':this.tone(rand(300,340),'triangle',0.1,0.07,90);this.noise(0.08,0.05,1600);break;
      case'bossdie':this.noise(0.7,0.28,500);this.tone(140,'sawtooth',0.6,0.15,40);break;
      case'pick':this.tone(720,'sine',0.07,0.06,1080);break;
      case'heal':this.tone(520,'sine',0.16,0.09,780);this.tone(660,'sine',0.2,0.08,880,0.07);break;
      case'taunt':this.tone(300,'sawtooth',0.22,0.09,180);break;
      case'dash':this.noise(0.16,0.12,2400);break;
      case'overdrive':this.tone(420,'sawtooth',0.25,0.08,840);break;
      case'overheat':this.tone(880,'square',0.1,0.07,660);this.tone(660,'square',0.14,0.07,440,0.1);break;
      case'leak':this.tone(110,'sine',0.3,0.15,55);this.noise(0.2,0.09,300);break;
      case'reveal':this.tone(880,'sawtooth',0.12,0.09,220);this.tone(440,'sawtooth',0.2,0.09,110,0.1);break;
      case'wave':this.tone(392,'triangle',0.14,0.08);this.tone(494,'triangle',0.14,0.08,null,0.12);this.tone(587,'triangle',0.22,0.09,null,0.24);break;
      case'clear':this.tone(587,'sine',0.12,0.08);this.tone(784,'sine',0.2,0.08,null,0.1);break;
      case'vote':this.tone(rand(800,900),'sine',0.05,0.035);break;
      case'confirm':[523,659,784].forEach((f,i)=>this.tone(f,'triangle',0.1,0.06,null,i*0.07));break;
      case'evolve':[392,523,659,1046].forEach((f,i)=>this.tone(f,'sine',0.14,0.06,null,i*0.08));break;
      case'down':this.tone(330,'sawtooth',0.3,0.09,110);break;
      case'respawn':this.tone(440,'sine',0.1,0.05,660);break;
      case'heartbeat':this.tone(64,'sine',0.1,0.15,48);this.tone(58,'sine',0.09,0.11,44,0.14);break;
      case'defeat':[392,311,233,155].forEach((f,i)=>this.tone(f,'triangle',0.3,0.08,null,i*0.18));break;
      case'ui':this.tone(600,'sine',0.05,0.04,700);break;
      case'draftOpen':this.tone(500,'sine',0.09,0.05,650);this.tone(750,'sine',0.09,0.05,900,0.09);break;
      case'pulse':this.tone(240,'sine',0.25,0.05,480);break;
      case'cloak':this.tone(500,'sine',0.12,0.035,250);break;
      case'split':this.noise(0.1,0.06,800);break;
      case'error':this.tone(200,'square',0.12,0.06,150);break;
      default:break;
    }
  }
};
window.addEventListener('pointerdown',()=>AudioSys.init(),{once:true});
window.addEventListener('keydown',()=>AudioSys.init(),{once:true});
