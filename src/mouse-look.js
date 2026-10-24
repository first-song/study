// Mouse movement looks around immediately. Pointer lock is an optional click
// gesture, so menus remain reachable and touch keeps its own drag interaction.
export function createMouseLook(canvas,{isPlaying,turn,onUnlock,onState,onAttack}) {
  let dragging=false,pointerId=null,lastX=0,lastY=0,inside=false,wasLocked=false,pending=false;
  const locked=()=>document.pointerLockElement===canvas;
  const announce=()=>onState?.(locked());
  const request=async()=>{
    if(!isPlaying()||locked()||pending||!canvas.requestPointerLock)return;
    pending=true;
    try { await canvas.requestPointerLock(); }
    catch { announce(); }
    finally { pending=false; }
  };
  canvas.addEventListener('pointerenter',event=>{lastX=event.clientX;lastY=event.clientY;inside=true;});
  canvas.addEventListener('pointerleave',()=>{inside=false;});
  canvas.addEventListener('pointerdown',event=>{
    if(!isPlaying())return;
    if(event.pointerType==='mouse')return;
    event.preventDefault();dragging=true;pointerId=event.pointerId;
    lastX=event.clientX;lastY=event.clientY;canvas.setPointerCapture(pointerId);
  });
  canvas.addEventListener('click',event=>{
    if(event.pointerType&&event.pointerType!=='mouse')return;
    if(matchMedia('(pointer:fine)').matches)request();
  });
  // 鼠标已锁定时，左键就是撕咬；未锁定时左键仍然是"锁定鼠标"手势。
  canvas.addEventListener('mousedown',event=>{
    if(event.button!==0||!isPlaying()||!locked())return;
    event.preventDefault();
    onAttack?.();
  });
  canvas.addEventListener('pointermove',event=>{
    if(locked()||!isPlaying())return;
    if(event.pointerType!=='mouse'&&(!dragging||event.pointerId!==pointerId))return;
    if(!inside&&event.pointerType==='mouse'){inside=true;lastX=event.clientX;lastY=event.clientY;return;}
    const dx=event.clientX-lastX,dy=event.clientY-lastY;
    lastX=event.clientX;lastY=event.clientY;
    turn(dx,dy);
  });
  document.addEventListener('mousemove',event=>{
    if(locked()&&isPlaying())turn(event.movementX,event.movementY);
  });
  for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,()=>{dragging=false;pointerId=null;});
  document.addEventListener('pointerlockchange',()=>{
    const nowLocked=locked(),lost=wasLocked&&!nowLocked;
    if(nowLocked&&!isPlaying()) {
      document.exitPointerLock();
      wasLocked=false;
      announce();
      return;
    }
    wasLocked=nowLocked;inside=false;announce();
    if(lost&&isPlaying())onUnlock?.();
  });
  document.addEventListener('pointerlockerror',announce);
  canvas.addEventListener('contextmenu',event=>event.preventDefault());
  return {
    get locked(){return locked();},
    request,
    clear(){dragging=false;pointerId=null;inside=false;},
    release(){if(locked())document.exitPointerLock();},
  };
}
