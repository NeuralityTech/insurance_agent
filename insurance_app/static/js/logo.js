(function(){
  // Determine image path relative to current page depth
  // We support being included from templates/ (served as /html/) and nested pages
  // Prefer Flask static path if the image is placed under static/img/
  var possiblePaths = [
    '/static/img/Neurality_PP.png',
    '../img/Neurality_PP.png',
    '../Neurality_PP.png',
    '/Neurality_PP.png',
    './Neurality_PP.png'
  ];
  function resolveSrc(paths, cb){
    var idx=0;
    function tryNext(){
      if(idx>=paths.length){ cb(paths[0]); return; }
      var img=new Image();
      img.onload=function(){ cb(paths[idx]); };
      img.onerror=function(){ idx++; tryNext(); };
      img.src=paths[idx];
    }
    tryNext();
  }
  function ensureTiledCss(){
    var exists = !!document.querySelector('link[href*="tiled_logo.css"]');
    if(!exists){
      var link = document.createElement('link');
      link.rel='stylesheet';
      link.href='/static/css/tiled_logo.css';
      document.head.appendChild(link);
    }
  }
  function enableTiledBg(){
    document.body.classList.add('tiled-logo-bg');
  }
  function inject(src){
    if(document.querySelector('.brand-logo')) return;
    var img=document.createElement('img');
    img.className='brand-logo';
    img.alt='Neurality Technologies';
    img.src=src;
    img.title='Neurality Technologies';
    img.referrerPolicy='no-referrer';
    document.body.appendChild(img);
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', function(){
      ensureTiledCss();
      enableTiledBg();
      resolveSrc(possiblePaths, inject);
    });
  }else{
    ensureTiledCss();
    enableTiledBg();
    resolveSrc(possiblePaths, inject);
  }
})();
