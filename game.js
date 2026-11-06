(() => {
  'use strict';
  const canvas = document.getElementById('game'), ctx = canvas.getContext('2d');
  const mini = document.getElementById('minimap'), mctx = mini.getContext('2d');
  const $ = id => document.getElementById(id);
  const ui = {alive:$('alive-count'),kills:$('kill-count'),timer:$('zone-timer'),progress:$('zone-progress'),health:$('health-fill'),healthText:$('health-text'),shield:$('shield-fill'),shieldText:$('shield-text'),ammo:$('ammo-current'),reserve:$('ammo-reserve'),medkits:$('medkit-count'),toast:$('toast'),feedback:$('feedback'),overlay:$('overlay'),end:$('end-overlay')};
  const W=2600,H=2600,TAU=Math.PI*2, rand=(a,b)=>a+Math.random()*(b-a), clamp=(n,a,b)=>Math.max(a,Math.min(b,n)), dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  let dpr=1, viewW=innerWidth, viewH=innerHeight, last=0, running=false, elapsed=0, kills=0, toastTimer=0, fireTimer=0, soundOn=false, audio;
  let keys={}, world=[], scenery=[], bullets=[], particles=[], loot=[], bots=[], storm={x:W/2,y:H/2,r:1180,startR:1180,targetR:820,time:80,duration:22,stage:0};
  const player={x:W/2,y:H/2+40,r:16,angle:0,hp:100,shield:50,ammo:30,reserve:120,medkits:2,speed:220,reload:0,invuln:0};
  let pointer={x:viewW*.65,y:viewH*.5,down:false}, joy={x:0,y:0,active:false,id:null}, mobileFire=false, camera={x:0,y:0};
  function resize(){dpr=Math.min(devicePixelRatio||1,2);viewW=innerWidth;viewH=innerHeight;canvas.width=Math.floor(viewW*dpr);canvas.height=Math.floor(viewH*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);}
  addEventListener('resize',resize);resize();
  function circleHit(x,y,r,o){const nx=clamp(x,o.x,o.x+o.w),ny=clamp(y,o.y,o.y+o.h);return (x-nx)**2+(y-ny)**2<r*r;}
  function collides(x,y,r){return world.some(o=>circleHit(x,y,r,o));}
  function moveEntity(e,dx,dy){if(!collides(e.x+dx,e.y,e.r))e.x+=dx;if(!collides(e.x,e.y+dy,e.r))e.y+=dy;e.x=clamp(e.x,e.r,W-e.r);e.y=clamp(e.y,e.r,H-e.r);}
  function makeWorld(){
    world=[];scenery=[];loot=[];bots=[];
    // Dense but walkable forest, with clearings around the settlement and spawn.
    for(let i=0;i<42;i++){
      const x=rand(110,W-230),y=rand(110,H-230),w=rand(75,160),h=rand(65,145);
      if(Math.hypot(x-W/2,y-H/2)<240)continue;
      if(world.some(o=>x<o.x+o.w+75&&x+w+75>o.x&&y<o.y+o.h+75&&y+h+75>o.y))continue;
      world.push({x,y,w,h,type:Math.random()<.78?'house':'shed',tone:Math.floor(rand(0,4))});
    }
    for(let i=0;i<330;i++){
      const x=rand(28,W-28),y=rand(28,H-28),r=rand(13,30);
      if(world.some(o=>x>o.x-30&&x<o.x+o.w+30&&y>o.y-30&&y<o.y+o.h+30))continue;
      scenery.push({x,y,r,type:Math.random()<.83?'tree':'rock',tone:Math.random()});
    }
    // Scatter supplies in open ground; the central compound has the best starting loot.
    for(let i=0;i<45;i++){
      let x,y,tries=0;do{x=rand(90,W-90);y=rand(90,H-90);tries++;}while((collides(x,y,18)||Math.hypot(x-W/2,y-H/2)<260)&&tries<100);
      loot.push({x,y,type:Math.random()<.57?'ammo':Math.random()<.76?'med':'shield',pulse:rand(0,TAU)});
    }
    for(let i=0;i<20;i++){
      let x,y;do{x=rand(100,W-100);y=rand(100,H-100);}while(collides(x,y,20)||Math.hypot(x-player.x,y-player.y)<360);
      bots.push({id:i,x,y,r:15,hp:100,shield:rand(0,35),angle:rand(0,TAU),speed:rand(105,145),ammo:30,shot:rand(.3,1.5),think:rand(0,2),wander:rand(0,TAU),alive:true,color:['#e7674f','#e3a34b','#ba76ce','#5eb4a4','#d46682'][i%5],name:['Rook','Viper','Mako','Echo','Nova','Ash','Riot','Kite','Wraith','Jinx'][i%10]});
    }
  }
  function begin(){makeWorld();bullets=[];particles=[];player.x=W/2;player.y=H/2+40;player.hp=100;player.shield=50;player.ammo=30;player.reserve=120;player.medkits=2;player.reload=0;player.invuln=1.5;kills=0;elapsed=0;storm={x:W/2,y:H/2,r:1180,startR:1180,targetR:840,time:28,duration:22,stage:0};running=true;ui.overlay.classList.add('hidden');ui.end.classList.add('hidden');showToast('DROP COMPLETE — FIND COVER');updateHud();last=performance.now();requestAnimationFrame(loop);}
  $('start-button').addEventListener('click',begin);$('again-button').addEventListener('click',begin);
  function showToast(text){ui.toast.textContent=text;ui.toast.classList.add('show');toastTimer=2.1;}
  function flash(text){ui.feedback.textContent=text;ui.feedback.classList.add('show');setTimeout(()=>ui.feedback.classList.remove('show'),900);}
  function updateHud(){ui.alive.textContent=1+bots.filter(b=>b.alive).length;ui.kills.textContent=kills;ui.health.style.width=player.hp+'%';ui.healthText.textContent=Math.ceil(player.hp);ui.shield.style.width=(player.shield/100*100)+'%';ui.shieldText.textContent=Math.ceil(player.shield);ui.ammo.textContent=player.ammo;ui.reserve.textContent=player.reserve;ui.medkits.textContent=player.medkits;}
  function formatTime(s){s=Math.max(0,Math.ceil(s));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');}
  function reload(){if(player.reload>0||player.ammo>=30||player.reserve<=0)return;player.reload=1.25;showToast('RELOADING');}
  $('reload-button').addEventListener('click',reload);addEventListener('keydown',e=>{keys[e.key.toLowerCase()]=true;if(e.key.toLowerCase()==='r')reload();if(e.key===' '){e.preventDefault();shoot();}});addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);
  function setPointer(e){const rect=canvas.getBoundingClientRect();pointer.x=e.clientX-rect.left;pointer.y=e.clientY-rect.top;const wx=pointer.x+camera.x,wy=pointer.y+camera.y;player.angle=Math.atan2(wy-player.y,wx-player.x);}
  canvas.addEventListener('pointermove',e=>{if(e.pointerType==='mouse')setPointer(e)});canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'){setPointer(e);pointer.down=true;canvas.setPointerCapture(e.pointerId);shoot()}});canvas.addEventListener('pointerup',e=>{if(e.pointerType==='mouse')pointer.down=false});
  function setupJoystick(){const base=$('joystick'),knob=$('joy-knob');function update(e){const r=base.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,dx=e.clientX-cx,dy=e.clientY-cy,max=36,len=Math.hypot(dx,dy),scale=len>max?max/len:1;joy.x=dx*scale/max;joy.y=dy*scale/max;knob.style.transform=`translate(${joy.x*36}px,${joy.y*36}px)`;if(len>7)aimNearest();}base.addEventListener('pointerdown',e=>{e.preventDefault();joy.active=true;joy.id=e.pointerId;base.setPointerCapture(e.pointerId);update(e)});base.addEventListener('pointermove',e=>{if(joy.active&&e.pointerId===joy.id)update(e)});function end(){joy.active=false;joy.x=joy.y=0;knob.style.transform=''}base.addEventListener('pointerup',end);base.addEventListener('pointercancel',end);}
  setupJoystick();
  function aimNearest(){let nearest=null,nd=620;for(const b of bots){if(!b.alive)continue;const d=dist(player,b);if(d<nd){nd=d;nearest=b;}}if(nearest)player.angle=Math.atan2(nearest.y-player.y,nearest.x-player.x);}
  $('fire-button').addEventListener('pointerdown',e=>{e.preventDefault();mobileFire=true;aimNearest();shoot();$('fire-button').setPointerCapture(e.pointerId)});['pointerup','pointercancel','lostpointercapture'].forEach(ev=>$('fire-button').addEventListener(ev,()=>mobileFire=false));
  $('heal-button').addEventListener('pointerdown',e=>{e.preventDefault();useMedkit()});
  function useMedkit(){if(player.medkits<=0){showToast('NO MEDKITS');return;}if(player.hp>=100){showToast('HEALTH ALREADY FULL');return;}player.medkits--;player.hp=Math.min(100,player.hp+45);showToast('MEDKIT USED  +45 HP');updateHud();tone(520,.08);}
  function tone(freq=160,duration=.06){if(!soundOn)return;try{audio=audio||new(window.AudioContext||window.webkitAudioContext)();const o=audio.createOscillator(),g=audio.createGain();o.type='triangle';o.frequency.value=freq;g.gain.setValueAtTime(.055,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+duration);}catch{}}
  $('sound-toggle').addEventListener('click',e=>{soundOn=!soundOn;e.currentTarget.textContent=soundOn?'♫':'♪';if(soundOn)tone(600,.08)});
  function shoot(){if(!running||player.reload>0)return;if(player.ammo<=0){reload();return;}player.ammo--;const spread=rand(-.035,.035),a=player.angle+spread;bullets.push({x:player.x+Math.cos(a)*21,y:player.y+Math.sin(a)*21,vx:Math.cos(a)*760,vy:Math.sin(a)*760,life:.85,owner:'player',damage:26});for(let i=0;i<3;i++)particles.push({x:player.x+Math.cos(a)*23,y:player.y+Math.sin(a)*23,vx:rand(-45,45),vy:rand(-45,45),life:.16,color:'#ffe49a',size:rand(2,4)});tone(120,.045);updateHud();}
  function botShoot(b,target){const a=Math.atan2(target.y-b.y,target.x-b.x)+rand(-.12,.12);bullets.push({x:b.x+Math.cos(a)*18,y:b.y+Math.sin(a)*18,vx:Math.cos(a)*520,vy:Math.sin(a)*520,life:.9,owner:b,damage:12});b.shot=rand(.75,1.25);}
  function hit(target,damage,source){if(target===player){if(player.invuln>0)return;let d=damage;if(player.shield>0){const s=Math.min(player.shield,d*.7);player.shield-=s;d-=s;}player.hp-=d;player.invuln=.13;particles.push({x:player.x,y:player.y,vx:rand(-40,40),vy:rand(-40,40),life:.3,color:'#ff7567',size:6});tone(80,.08);if(player.hp<=0)finish(false);updateHud();}else{if(target.shield>0){const s=Math.min(target.shield,damage*.65);target.shield-=s;damage-=s;}target.hp-=damage;particles.push({x:target.x,y:target.y,vx:rand(-30,30),vy:rand(-30,30),life:.25,color:'#ffcf8c',size:4});if(target.hp<=0){target.alive=false;for(let i=0;i<8;i++)particles.push({x:target.x,y:target.y,vx:rand(-85,85),vy:rand(-85,85),life:rand(.25,.55),color:target.color,size:rand(2,5)});if(source==='player'){kills++;flash('ELIMINATION +1');tone(430,.12);if(Math.random()<.42)loot.push({x:target.x+rand(-12,12),y:target.y+rand(-12,12),type:Math.random()<.5?'ammo':'med',pulse:0});}updateHud();}}
  }
  function finish(win){if(!running)return;running=false;$('end-title').textContent=win?'VICTORY':'ELIMINATED';$('end-title').style.color=win?'var(--lime)':'#ff7167';$('end-copy').textContent=win?'The island is yours.':'Your run ends here. Ready for another drop?';$('end-kills').textContent=kills;$('end-time').textContent=formatTime(elapsed);ui.end.classList.remove('hidden');}
  function update(dt){
    elapsed+=dt;player.invuln=Math.max(0,player.invuln-dt);if(player.reload>0){player.reload-=dt;if(player.reload<=0){const n=Math.min(30-player.ammo,player.reserve);player.ammo+=n;player.reserve-=n;showToast('RELOAD COMPLETE');updateHud();}}
    if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)ui.toast.classList.remove('show');}
    if(storm.stage===0){storm.time-=dt;if(storm.time<=0){storm.stage=1;storm.startR=storm.r;storm.targetR=840;storm.time=storm.duration=22;showToast('STORM CLOSING — MOVE IN');$('phase-label').textContent='ZONE CLOSING';}}
    else if(storm.stage===1){storm.time-=dt;const p=clamp(1-storm.time/storm.duration,0,1);storm.r=storm.startR+(storm.targetR-storm.startR)*p;if(storm.time<=0){storm.r=storm.targetR;storm.stage=2;storm.time=14;storm.x=clamp(storm.x+rand(-130,130),750,1850);storm.y=clamp(storm.y+rand(-130,130),750,1850);$('phase-label').textContent='SAFE ZONE';}}
    else if(storm.stage===2){storm.time-=dt;if(storm.time<=0&&storm.r>225){storm.stage=1;storm.startR=storm.r;storm.targetR=Math.max(210,storm.r*.67);storm.time=storm.duration=18;showToast('NEW SAFE ZONE MARKED');$('phase-label').textContent='ZONE CLOSING';}}
    ui.timer.textContent=formatTime(storm.time);ui.progress.style.width=(storm.stage===1?clamp(100*(1-storm.time/storm.duration),0,100):100)+'%';
    let ix=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0)+joy.x,iy=(keys.s||keys.arrowdown?1:0)-(keys.w||keys.arrowup?1:0)+joy.y;const il=Math.hypot(ix,iy);if(il>1){ix/=il;iy/=il;}if(il>.06){moveEntity(player,ix*player.speed*dt,iy*player.speed*dt);if(joy.active)aimNearest();}
    if(pointer.down||keys[' ']||mobileFire){if(mobileFire)aimNearest();fireTimer-=dt;if(fireTimer<=0){shoot();fireTimer=.13;}}else fireTimer=0;
    if(!pointer.down&&!mobileFire&&!joy.active&&Math.hypot(pointer.x-viewW/2,pointer.y-viewH/2)>20&&matchMedia('(pointer:fine)').matches){/* mouse angle is set on pointer movement */}
    for(const b of bots){if(!b.alive)continue;b.think-=dt;b.shot-=dt;let target=player,near=dist(player,b);for(const other of bots){if(!other.alive||other===b)continue;const d=dist(other,b);if(d<near&&d<490){near=d;target=other;}}
      if(b.think<=0){b.think=rand(.3,.75);const desired=Math.atan2(target.y-b.y,target.x-b.x);if(near<430)b.angle=desired+rand(-.25,.25);else{b.wander+=rand(-1.2,1.2);b.angle=b.wander;}}
      if(near<430){const desired=Math.atan2(target.y-b.y,target.x-b.x);if(near>210)moveEntity(b,Math.cos(desired)*b.speed*dt,Math.sin(desired)*b.speed*dt);else if(near<125)moveEntity(b,-Math.cos(desired)*b.speed*dt*.55,-Math.sin(desired)*b.speed*dt*.55);}else moveEntity(b,Math.cos(b.wander)*b.speed*dt*.45,Math.sin(b.wander)*b.speed*dt*.45);
      if(near<390&&b.shot<=0){botShoot(b,target);}
      if(Math.hypot(b.x-storm.x,b.y-storm.y)>storm.r-8){b.hp-=6*dt;if(b.hp<=0){b.alive=false;updateHud();}}
    }
    for(let i=bullets.length-1;i>=0;i--){const q=bullets[i];q.x+=q.vx*dt;q.y+=q.vy*dt;q.life-=dt;let gone=q.life<=0||q.x<0||q.y<0||q.x>W||q.y>H||world.some(o=>q.x>o.x&&q.x<o.x+o.w&&q.y>o.y&&q.y<o.y+o.h);if(!gone){if(q.owner==='player'){for(const b of bots){if(b.alive&&Math.hypot(q.x-b.x,q.y-b.y)<b.r+4){hit(b,q.damage,'player');gone=true;break;}}}else if(Math.hypot(q.x-player.x,q.y-player.y)<player.r+4){hit(player,q.damage,q.owner);gone=true;}}
      if(gone)bullets.splice(i,1);
    }
    for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;}particles=particles.filter(p=>p.life>0);
    for(let i=loot.length-1;i>=0;i--){const item=loot[i];item.pulse+=dt;if(Math.hypot(item.x-player.x,item.y-player.y)<31){if(item.type==='ammo'){player.reserve=Math.min(240,player.reserve+30);showToast('AMMO +30');}else if(item.type==='med'){player.medkits=Math.min(5,player.medkits+1);showToast('MEDKIT +1');}else{player.shield=Math.min(100,player.shield+35);showToast('SHIELD +35');}loot.splice(i,1);updateHud();tone(650,.08);}}
    if(Math.hypot(player.x-storm.x,player.y-storm.y)>storm.r){player.hp-=9*dt;if(Math.floor(elapsed*2)%2===0){}if(player.hp<=0)finish(false);updateHud();if(Math.floor(elapsed)%5===0&&Math.abs(elapsed-Math.round(elapsed))<dt)showToast('YOU ARE OUTSIDE THE SAFE ZONE');}
    camera.x=clamp(player.x-viewW/2,0,W-viewW);camera.y=clamp(player.y-viewH/2,0,H-viewH);
    if(bots.every(b=>!b.alive))finish(true);updateHud();
  }
  function drawGround(){
    ctx.fillStyle='#334a35';ctx.fillRect(0,0,W,H);
    // soft terrain variation and field tracks
    for(let y=35;y<H;y+=78)for(let x=28;x<W;x+=87){const n=(Math.sin(x*12.98+y*78.23)*43758.5)%1;ctx.fillStyle=n>.05?'rgba(181,190,115,.07)':'rgba(14,32,22,.12)';ctx.beginPath();ctx.ellipse(x+Math.cos(y)*8,y+Math.sin(x)*7,2.4,1.2,0,0,TAU);ctx.fill();}
    ctx.strokeStyle='rgba(202,190,126,.25)';ctx.lineWidth=44;ctx.beginPath();ctx.moveTo(-20,790);ctx.bezierCurveTo(650,700,780,930,1320,820);ctx.bezierCurveTo(1740,740,2020,560,2640,650);ctx.stroke();ctx.strokeStyle='rgba(232,217,159,.22)';ctx.lineWidth=2;ctx.setLineDash([12,13]);ctx.stroke();ctx.setLineDash([]);
    ctx.strokeStyle='rgba(202,190,126,.2)';ctx.lineWidth=36;ctx.beginPath();ctx.moveTo(1650,-20);ctx.bezierCurveTo(1700,500,1510,850,1680,1300);ctx.bezierCurveTo(1810,1700,1510,2080,1600,2620);ctx.stroke();
    ctx.fillStyle='rgba(229,219,179,.12)';ctx.fillRect(1090,1120,430,350);
    // small shoreline boundary
    ctx.strokeStyle='#9eaa68';ctx.lineWidth=24;ctx.strokeRect(12,12,W-24,H-24);ctx.strokeStyle='#d3c989';ctx.lineWidth=3;ctx.strokeRect(24,24,W-48,H-48);
  }
  function drawHouse(o){const colors=['#8c7657','#756d56','#9b8261','#69715c'];ctx.fillStyle='rgba(15,22,16,.36)';ctx.fillRect(o.x+7,o.y+10,o.w,o.h);ctx.fillStyle=colors[o.tone];ctx.fillRect(o.x,o.y,o.w,o.h);ctx.fillStyle='#57483c';ctx.fillRect(o.x+4,o.y+4,o.w-8,o.h-8);ctx.fillStyle=['#a67a56','#777b61','#a48962','#7c795c'][o.tone];ctx.beginPath();ctx.moveTo(o.x-8,o.y+13);ctx.lineTo(o.x+o.w*.5,o.y-9);ctx.lineTo(o.x+o.w+8,o.y+13);ctx.lineTo(o.x+o.w+2,o.y+o.h*.48);ctx.lineTo(o.x+o.w*.5,o.y+o.h*.58);ctx.lineTo(o.x-2,o.y+o.h*.48);ctx.closePath();ctx.fill();ctx.strokeStyle='rgba(230,206,149,.4)';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#d7bd85';ctx.fillRect(o.x+o.w*.18,o.y+o.h*.4,13,14);ctx.fillRect(o.x+o.w*.68,o.y+o.h*.4,13,14);ctx.fillStyle='#433b32';ctx.fillRect(o.x+o.w*.44,o.y+o.h*.62,18,o.h*.35);ctx.fillStyle='#d8d0b1';ctx.fillRect(o.x+o.w*.47,o.y+o.h*.67,2,2);}
  function drawScene(){ctx.clearRect(0,0,viewW,viewH);ctx.save();ctx.translate(-camera.x,-camera.y);drawGround();
    // Storm field tints everything outside the current circle.
    ctx.save();ctx.fillStyle='rgba(35,91,157,.20)';ctx.beginPath();ctx.rect(0,0,W,H);ctx.arc(storm.x,storm.y,storm.r,0,TAU,true);ctx.fill('evenodd');ctx.restore();
    for(const o of world)drawHouse(o);
    for(const s of scenery){if(s.type==='tree'){ctx.fillStyle='rgba(8,20,13,.35)';ctx.beginPath();ctx.ellipse(s.x+6,s.y+8,s.r*1.05,s.r*.75,0,0,TAU);ctx.fill();ctx.fillStyle=['#31583b','#3e6540','#466b42','#2c5038'][Math.floor(s.tone*4)];ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,TAU);ctx.fill();ctx.fillStyle='rgba(135,164,92,.35)';ctx.beginPath();ctx.arc(s.x-s.r*.27,s.y-s.r*.3,s.r*.47,0,TAU);ctx.fill();ctx.fillStyle='rgba(255,255,255,.07)';ctx.beginPath();ctx.arc(s.x-s.r*.12,s.y-s.r*.5,s.r*.18,0,TAU);ctx.fill();}else{ctx.fillStyle='#667363';ctx.beginPath();ctx.ellipse(s.x,s.y,s.r,s.r*.72,-.3,0,TAU);ctx.fill();ctx.fillStyle='#89917b';ctx.beginPath();ctx.ellipse(s.x-4,s.y-4,s.r*.47,s.r*.3,-.4,0,TAU);ctx.fill();}}
    // loot crates
    for(const q of loot){const bob=Math.sin(q.pulse*3)*2;ctx.save();ctx.translate(q.x,q.y+bob);ctx.shadowColor=q.type==='med'?'#ff8080':'#d8ff68';ctx.shadowBlur=14;ctx.fillStyle=q.type==='med'?'#d75f52':q.type==='shield'?'#5ab6e8':'#c3a84f';ctx.fillRect(-8,-7,16,14);ctx.shadowBlur=0;ctx.strokeStyle='#f0e2b2';ctx.lineWidth=1;ctx.strokeRect(-8,-7,16,14);ctx.fillStyle='#fff4c9';ctx.font='bold 11px sans-serif';ctx.textAlign='center';ctx.fillText(q.type==='med'?'+':q.type==='shield'?'⬟':'•',0,4);ctx.restore();}
    // Safe-zone boundary
    ctx.beginPath();ctx.arc(storm.x,storm.y,storm.r,0,TAU);ctx.strokeStyle='rgba(203,255,133,.78)';ctx.lineWidth=3;ctx.setLineDash([12,9]);ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.arc(storm.x,storm.y,storm.r+8,0,TAU);ctx.strokeStyle='rgba(27,65,41,.65)';ctx.lineWidth=8;ctx.stroke();
    // Characters and projectiles stay legible above the foliage.
    for(const b of bots){if(!b.alive)continue;ctx.save();ctx.translate(b.x,b.y);ctx.rotate(b.angle);ctx.fillStyle='rgba(0,0,0,.35)';ctx.beginPath();ctx.ellipse(2,7,17,12,0,0,TAU);ctx.fill();ctx.fillStyle='#242e29';ctx.beginPath();ctx.roundRect(-13,-11,27,22,7);ctx.fill();ctx.fillStyle=b.color;ctx.beginPath();ctx.roundRect(-10,-9,21,18,6);ctx.fill();ctx.fillStyle='#1b2620';ctx.fillRect(4,-3,19,6);ctx.fillStyle='#d9ddc9';ctx.beginPath();ctx.arc(-2,0,4,0,TAU);ctx.fill();ctx.restore();ctx.fillStyle='#17201a';ctx.fillRect(b.x-18,b.y-23,36,4);ctx.fillStyle=b.hp>45?'#91dc70':'#f46b58';ctx.fillRect(b.x-18,b.y-23,36*clamp(b.hp/100,0,1),4);}
    ctx.save();ctx.translate(player.x,player.y);ctx.rotate(player.angle);ctx.globalAlpha=player.invuln>0?.6+Math.sin(elapsed*30)*.3:1;ctx.fillStyle='rgba(0,0,0,.42)';ctx.beginPath();ctx.ellipse(2,8,19,13,0,0,TAU);ctx.fill();ctx.fillStyle='#27332c';ctx.beginPath();ctx.roundRect(-14,-12,29,24,8);ctx.fill();ctx.fillStyle='#d8ff68';ctx.beginPath();ctx.roundRect(-11,-9,22,18,6);ctx.fill();ctx.fillStyle='#2d392e';ctx.fillRect(4,-4,23,8);ctx.fillStyle='#eee8c9';ctx.beginPath();ctx.arc(-2,0,4.7,0,TAU);ctx.fill();ctx.restore();
    for(const q of bullets){ctx.fillStyle=q.owner==='player'?'#fff2a1':'#ff9675';ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=9;ctx.beginPath();ctx.arc(q.x,q.y,3,0,TAU);ctx.fill();ctx.shadowBlur=0;}
    for(const p of particles){ctx.globalAlpha=clamp(p.life/.4,0,1);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,TAU);ctx.fill();}ctx.globalAlpha=1;
    ctx.restore();drawMini();
  }
  function drawMini(){const s=mini.width/W;mctx.clearRect(0,0,mini.width,mini.height);mctx.save();mctx.beginPath();mctx.arc(72,72,70,0,TAU);mctx.clip();mctx.fillStyle='#314b38';mctx.fillRect(0,0,144,144);mctx.fillStyle='#5e6649';for(const o of world){mctx.fillRect(o.x*s,o.y*s,o.w*s,o.h*s);}mctx.fillStyle='#6b8c55';for(const t of scenery){if(t.type==='tree'){mctx.beginPath();mctx.arc(t.x*s,t.y*s,Math.max(1,t.r*s),0,TAU);mctx.fill();}}mctx.strokeStyle='#d8ff68';mctx.lineWidth=1.5;mctx.beginPath();mctx.arc(storm.x*s,storm.y*s,storm.r*s,0,TAU);mctx.stroke();mctx.fillStyle='#ff8567';for(const b of bots){if(b.alive){mctx.beginPath();mctx.arc(b.x*s,b.y*s,1.8,0,TAU);mctx.fill();}}mctx.fillStyle='#fff';mctx.beginPath();mctx.arc(player.x*s,player.y*s,3.3,0,TAU);mctx.fill();mctx.strokeStyle='#182219';mctx.lineWidth=1;mctx.stroke();mctx.restore();}
  function loop(now){if(!running)return;const dt=Math.min(.04,(now-last)/1000||0);last=now;update(dt);drawScene();if(running)requestAnimationFrame(loop);}
  makeWorld();camera.x=clamp(player.x-viewW/2,0,W-viewW);camera.y=clamp(player.y-viewH/2,0,H-viewH);drawScene();
})();
