// @ts-nocheck
import { useEffect, useRef } from "react";
import type { Well } from "../App";

interface DetailedWellViewProps {
  wells: Well[];
  onClose: () => void;
}

export default function DetailedWellView({ wells, onClose }: DetailedWellViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const cv = document.getElementById('sc3d') as HTMLCanvasElement;
    if (!cv) return;
    const CW = cv.width;
    const CH = cv.height;
    const cx = cv.getContext('2d');
    if (!cx) return;

    let maxDepth = 10000;
    wells.forEach(w => {
      if (w.total_depth_ft && w.total_depth_ft > maxDepth) maxDepth = w.total_depth_ft;
    });

    let minLon = 999, maxLon = -999, minLat = 999, maxLat = -999;
    wells.forEach(w => {
      if (w.lon < minLon) minLon = w.lon;
      if (w.lon > maxLon) maxLon = w.lon;
      if (w.lat < minLat) minLat = w.lat;
      if (w.lat > maxLat) maxLat = w.lat;
    });
    // Single well fallback places it dead center in the block diagram
    if (minLon === maxLon) { minLon -= 0.01; maxLon += 0.01; }
    if (minLat === maxLat) { minLat -= 0.01; maxLat += 0.01; }

    const NW = wells.length;
    const WD = wells.map(w => {
      const perf = w.perforations?.[0] || { top_ft: w.total_depth_ft ? w.total_depth_ft * 0.8 : 8000, bot_ft: w.total_depth_ft ? w.total_depth_ft * 0.9 : 9000 };
      const lease = w.leases?.[0] || { top_ft: null, bot_ft: null };
      return {
        nx: (w.lon - minLon) / (maxLon - minLon),
        ny: (w.lat - minLat) / (maxLat - minLat),
        pt: perf.top_ft,
        pb: perf.bot_ft,
        td: w.total_depth_ft || maxDepth,
        tvd: w.total_depth_ft || maxDepth,
        nm: w.name,
        api14: w.api,
        county: w.county || "Unknown",
        country: w.country || "USA",
        state: w.region || "Unknown",
        district: "N/A",
        basin: w.basin || "Unknown",
        op: "Unknown Operator",
        play: "Unknown Play",
        region: w.region || "Unknown",
        wt: "OIL",
        str: "N/A",
        shlLat: w.lat,
        shlLon: w.lon,
        bhlLat: w.lat,
        bhlLon: w.lon,
        traj: "VERTICAL",
        fp: "N/A", fpm: "N/A", lpm: "N/A",
        lmn: lease.top_ft,
        lmx: lease.bot_ft,
        lg: lease.grantor || "Unknown"
      };
    });

    const MD = maxDepth;
    const BD = [0, maxDepth * 0.25, maxDepth * 0.5, maxDepth * 0.75, maxDepth];
    const FM = [
      {n: "Surface Sand", w: wells.length},
      {n: "Upper Shale", w: wells.length},
      {n: "Middle Limestone", w: wells.length},
      {n: "Deep Granite", w: wells.length}
    ];
    const LONMIN = minLon; const LONMAX = maxLon;
    const LATMIN = minLat; const LATMAX = maxLat;
    const FS = "Subsurface Block Diagram";

    var BW=400,BD_=400,BH=450;
    var rotX=-0.55,rotZ=0.7,scale=0.72,panX=0,panY=-30;
    var dragging=false,lastMX=0,lastMY=0,shiftHeld=false,dragBtn=0;
    var fmMode=false,savedView: any={};
    
    function project(x: number, y: number, z: number){
      var cz=Math.cos(rotZ),sz=Math.sin(rotZ),x1=x*cz-y*sz,y1=x*sz+y*cz;
      var cX=Math.cos(rotX),sX=Math.sin(rotX),z2=y1*sX+z*cX;
      return{x:CW/2+x1*scale+panX,y:CH/2-z2*scale+panY};
    }
    function fmt(v: any){if(v==null)return'N/A';if(Math.abs(v)>=1e6)return(v/1e6).toFixed(1)+'M';if(Math.abs(v)>=1e3)return(v/1e3).toFixed(1)+'k';return Math.round(v).toLocaleString();}
    var FC=['#D4B896','#8B96AF','#C5B8A0','#B07050','#A0B8C0','#C09060','#7A8A6A','#D8C890','#A09080','#706050'];
    function shade(c: string,p: number){var n=parseInt(c.replace('#',''),16),r=(n>>16)+p,g=((n>>8)&0xFF)+p,b=(n&0xFF)+p;return'#'+((1<<24)+(Math.max(0,Math.min(255,r))<<16)+(Math.max(0,Math.min(255,g))<<8)+Math.max(0,Math.min(255,b))).toString(16).slice(1);}
    var _s=42;function sr(){_s=(_s*16807)%2147483647;return(_s-1)/2147483646;}
    var hw0=BW/2,hd0=BD_/2,trees: any[]=[];
    for(var t=0;t<12;t++){var tx=-hw0*0.9+sr()*BW*0.9,ty=-hd0*0.9+sr()*BD_*0.9,tsz=12+sr()*14,tc=false;
      for(var wi=0;wi<NW;wi++){var wx=-hw0+WD[wi].nx*BW,wy=-hd0+WD[wi].ny*BD_;if(Math.abs(tx-wx)<30&&Math.abs(ty-wy)<30){tc=true;break;}}
      if(!tc)trees.push({x:tx,y:ty,sz:tsz});}
    function drawTree(tx: number,ty: number,sz: number){var b=project(tx,ty,0),tr=project(tx,ty,sz*0.3);cx.strokeStyle='#6B4826';cx.lineWidth=Math.max(1,2*scale);cx.beginPath();cx.moveTo(b.x,b.y);cx.lineTo(tr.x,tr.y);cx.stroke();
      for(var j=0;j<3;j++){var bz=sz*(0.2+j*0.22),tz=sz*(0.48+j*0.22),bp=project(tx,ty,bz),tp=project(tx,ty,tz),sp=Math.max(2,(3.5-j)*2.5*scale);cx.fillStyle='rgb('+(45+j*15)+','+(88+j*14)+','+(35+j*10)+')';cx.beginPath();cx.moveTo(bp.x-sp,bp.y);cx.lineTo(tp.x,tp.y);cx.lineTo(bp.x+sp,bp.y);cx.closePath();cx.fill();}}

    function texFace(pts: any[],fi: number,br: number){if(scale<0.35)return;var nm=fi<FM.length?FM[fi].n.toUpperCase():'';var pt=fi%5;
    if(nm.indexOf('SAND')>=0)pt=0;else if(nm.indexOf('SHALE')>=0)pt=1;else if(nm.indexOf('LIME')>=0||nm.indexOf('DOLO')>=0)pt=2;
    else if(nm.indexOf('GRANITE')>=0||nm.indexOf('WASH')>=0||nm.indexOf('PENN')>=0)pt=3;else if(nm.indexOf('ANHYDRITE')>=0||nm.indexOf('GYPS')>=0)pt=4;
    cx.save();cx.beginPath();for(var k=0;k<pts.length;k++){if(k===0)cx.moveTo(pts[k].x,pts[k].y);else cx.lineTo(pts[k].x,pts[k].y);}cx.closePath();cx.clip();
    var mnX=9e3,mxX=-9e3,mnY=9e3,mxY=-9e3;for(var k=0;k<pts.length;k++){mnX=Math.min(mnX,pts[k].x);mxX=Math.max(mxX,pts[k].x);mnY=Math.min(mnY,pts[k].y);mxY=Math.max(mxY,pts[k].y);}
    var a=Math.max(40,(br||0)+60);
    if(pt===0){cx.fillStyle='rgba('+a+','+(a-10)+','+(a-30)+',0.3)';for(var sy=mnY;sy<mxY;sy+=6){for(var sx=mnX;sx<mxX;sx+=8){var h=((sx*7919+sy*104729)&0xFFFF)/65535;if(h>0.35)cx.fillRect(sx+h*4,sy+h*3,1.3,1.3);}}}
    else if(pt===1){cx.strokeStyle='rgba('+a+','+a+','+(a+15)+',0.25)';cx.lineWidth=0.6;for(var sy=mnY;sy<mxY;sy+=3.5){cx.beginPath();cx.moveTo(mnX,sy);cx.lineTo(mxX,sy);cx.stroke();}}
    else if(pt===2){cx.strokeStyle='rgba('+a+','+(a-10)+','+(a-20)+',0.2)';cx.lineWidth=0.5;var rw=0;for(var sy=mnY;sy<mxY;sy+=7){cx.beginPath();cx.moveTo(mnX,sy);cx.lineTo(mxX,sy);cx.stroke();var off=rw%2===0?0:11;for(var sx=mnX+off;sx<mxX;sx+=22){cx.beginPath();cx.moveTo(sx,sy);cx.lineTo(sx,sy+7);cx.stroke();}rw++;}}
    else if(pt===3){for(var sy=mnY;sy<mxY;sy+=9){for(var sx=mnX;sx<mxX;sx+=11){var h=((sx*3571+sy*7727)&0xFFFF)/65535;var sz=0.8+h*2.5;cx.fillStyle='rgba('+(a+20)+','+(a-5)+','+(a-25)+',0.25)';cx.beginPath();cx.arc(sx+h*8,sy+h*6,sz,0,Math.PI*2);cx.fill();}}}
    else{cx.strokeStyle='rgba('+a+','+a+','+(a+10)+',0.15)';cx.lineWidth=0.4;for(var d=mnX+mnY;d<mxX+mxY;d+=9){cx.beginPath();cx.moveTo(d-mnY,mnY);cx.lineTo(d-mxY,mxY);cx.stroke();}}
    cx.restore();}

    var wSP: any[] = [];
    function render(){
      _s=42;cx.clearRect(0,0,CW,CH);
      var bg=cx.createLinearGradient(0,0,0,CH);bg.addColorStop(0,'#EAEAEA');bg.addColorStop(1,'#D4D4D4');cx.fillStyle=bg;cx.fillRect(0,0,CW,CH);
      var hw=BW/2,hd=BD_/2,cz=Math.cos(rotZ),sz=Math.sin(rotZ);
      var sF=sz>=0,sB=sz<0,sR=cz>=0,sL=cz<0;
      for(var fi=0;fi<BD.length-1;fi++){var zt=-BD[fi]/MD*BH,zb=-BD[fi+1]/MD*BH,col=FC[fi%FC.length];
        if(sB){var p0=project(-hw,-hd,zt),p1=project(hw,-hd,zt),p2=project(hw,-hd,zb),p3=project(-hw,-hd,zb);cx.fillStyle=shade(col,-20);cx.beginPath();cx.moveTo(p0.x,p0.y);cx.lineTo(p1.x,p1.y);cx.lineTo(p2.x,p2.y);cx.lineTo(p3.x,p3.y);cx.closePath();cx.fill();texFace([p0,p1,p2,p3],fi,-20);cx.strokeStyle='rgba(0,0,0,0.2)';cx.lineWidth=0.5;cx.stroke();}
        if(sL){var p0=project(-hw,-hd,zt),p1=project(-hw,hd,zt),p2=project(-hw,hd,zb),p3=project(-hw,-hd,zb);cx.fillStyle=shade(col,-25);cx.beginPath();cx.moveTo(p0.x,p0.y);cx.lineTo(p1.x,p1.y);cx.lineTo(p2.x,p2.y);cx.lineTo(p3.x,p3.y);cx.closePath();cx.fill();texFace([p0,p1,p2,p3],fi,-25);cx.strokeStyle='rgba(0,0,0,0.2)';cx.lineWidth=0.5;cx.stroke();}}
      var s0=project(-hw,-hd,0),s1=project(hw,-hd,0),s2=project(hw,hd,0),s3=project(-hw,hd,0);
      var sg=cx.createLinearGradient(s0.x,s0.y,s2.x,s2.y);sg.addColorStop(0,'#6A8B3A');sg.addColorStop(0.5,'#7A9B4A');sg.addColorStop(1,'#5C8828');
      cx.fillStyle=sg;cx.beginPath();cx.moveTo(s0.x,s0.y);cx.lineTo(s1.x,s1.y);cx.lineTo(s2.x,s2.y);cx.lineTo(s3.x,s3.y);cx.closePath();cx.fill();cx.strokeStyle='#4A7020';cx.lineWidth=1.5;cx.stroke();
      cx.strokeStyle='rgba(255,255,255,0.2)';cx.lineWidth=0.5;
      for(var g=0;g<=8;g++){var gx=-hw+g*BW/8,pa=project(gx,-hd,0),pb=project(gx,hd,0);cx.beginPath();cx.moveTo(pa.x,pa.y);cx.lineTo(pb.x,pb.y);cx.stroke();var gy=-hd+g*BD_/8,pc=project(-hw,gy,0),pd=project(hw,gy,0);cx.beginPath();cx.moveTo(pc.x,pc.y);cx.lineTo(pd.x,pd.y);cx.stroke();}
      cx.strokeStyle='rgba(90,130,50,0.4)';cx.lineWidth=0.8;
      for(var gt=0;gt<20;gt++){var gx=-hw*0.95+sr()*BW*0.95,gy=-hd*0.95+sr()*BD_*0.95,gb=project(gx,gy,0),gtp=project(gx,gy,2+sr()*4);cx.beginPath();cx.moveTo(gb.x,gb.y);cx.lineTo(gtp.x,gtp.y);cx.stroke();}
      for(var ti=0;ti<trees.length;ti++)drawTree(trees[ti].x,trees[ti].y,trees[ti].sz);
      var fmL=[];
      for(var fi=0;fi<BD.length-1;fi++){var zt=-BD[fi]/MD*BH,zb=-BD[fi+1]/MD*BH,col=FC[fi%FC.length];
        if(sF){var p0=project(-hw,hd,zt),p1=project(hw,hd,zt),p2=project(hw,hd,zb),p3=project(-hw,hd,zb);cx.fillStyle=col;cx.beginPath();cx.moveTo(p0.x,p0.y);cx.lineTo(p1.x,p1.y);cx.lineTo(p2.x,p2.y);cx.lineTo(p3.x,p3.y);cx.closePath();cx.fill();texFace([p0,p1,p2,p3],fi,0);cx.strokeStyle='rgba(0,0,0,0.35)';cx.lineWidth=1;cx.stroke();
          if(fi<FM.length){var mZ=(zt+zb)/2,lp0=project(-hw,hd,mZ),lp1=project(hw,hd,mZ),fH=Math.abs(project(0,hd,zt).y-project(0,hd,zb).y);fmL.push({x:(lp0.x+lp1.x)/2,y:(lp0.y+lp1.y)/2,n:FM[fi].n,fH:fH});}}
        if(sR){var q0=project(hw,-hd,zt),q1=project(hw,hd,zt),q2=project(hw,hd,zb),q3=project(hw,-hd,zb);cx.fillStyle=shade(col,-15);cx.beginPath();cx.moveTo(q0.x,q0.y);cx.lineTo(q1.x,q1.y);cx.lineTo(q2.x,q2.y);cx.lineTo(q3.x,q3.y);cx.closePath();cx.fill();texFace([q0,q1,q2,q3],fi,-15);cx.strokeStyle='rgba(0,0,0,0.35)';cx.lineWidth=1;cx.stroke();
          if(!sF&&fi<FM.length){var mZ=(zt+zb)/2,rp0=project(hw,-hd,mZ),rp1=project(hw,hd,mZ),fH=Math.abs(project(hw,0,zt).y-project(hw,0,zb).y);fmL.push({x:(rp0.x+rp1.x)/2,y:(rp0.y+rp1.y)/2,n:FM[fi].n,fH:fH});}}}
      if(!fmMode){cx.textAlign='center';cx.textBaseline='middle';
        for(var li=0;li<fmL.length;li++){var lb=fmL[li];if(lb.fH<16)continue;
          var fs=Math.min(11,Math.max(8,Math.floor(lb.fH*0.5)));cx.font='bold '+fs+'px Arial';
          var tw=cx.measureText(lb.n).width;cx.fillStyle='rgba(255,255,255,0.82)';cx.beginPath();cx.roundRect(lb.x-tw/2-5,lb.y-fs/2-2,tw+10,fs+4,3);cx.fill();
          cx.fillStyle='#333';cx.fillText(lb.n,lb.x,lb.y);}}
      wSP=[];var _labels: any[]=[];
      for(var i=0;i<NW;i++){var w=WD[i],wx=-hw+w.nx*BW,wy=-hd+w.ny*BD_;
        var ptZ=-w.pt/MD*BH,pbZ=-w.pb/MD*BH,tdZ=-w.td/MD*BH;
        var ps=project(wx,wy,0);
        var _tr=(w.traj||'').toUpperCase(),_isH=_tr.indexOf('HORIZ')>=0,_isD=_tr.indexOf('DIRECT')>=0;
        var ptd,ppt,ppb;
        if(_isH){
          var koD=w.tvd!=null?w.tvd:w.pt*0.85,koZ=-koD/MD*BH;
          var llV=(w.ll!=null&&w.ll>0)?w.ll:Math.max(500,Math.abs(w.td-(w.tvd||w.pt)));
          var latExt=Math.max(20,llV/MD*BW*0.6);
          var latDir=(i%2===0?1:-1),latEndX=Math.max(-hw+15,Math.min(hw-15,wx+latDir*latExt));
          var pko=project(wx,wy,koZ);ptd=project(latEndX,wy,koZ);
          cx.strokeStyle='#555';cx.lineWidth=2.5;
          cx.beginPath();cx.moveTo(ps.x,ps.y);cx.lineTo(pko.x,pko.y);cx.stroke();
          var _bx=pko.x+(ptd.x-pko.x)*0.08,_by=pko.y+(ptd.y-pko.y)*0.5;
          cx.beginPath();cx.moveTo(pko.x,pko.y);cx.quadraticCurveTo(_bx,_by,pko.x+(ptd.x-pko.x)*0.3,ptd.y);cx.lineTo(ptd.x,ptd.y);cx.stroke();
          var dn=w.td-koD;if(dn<1)dn=1;
          var f1=Math.max(0,Math.min(1,(w.pt-koD)/dn)),f2=Math.max(0,Math.min(1,(w.pb-koD)/dn));
          ppt={x:pko.x+(ptd.x-pko.x)*f1,y:pko.y+(ptd.y-pko.y)*f1};
          ppb={x:pko.x+(ptd.x-pko.x)*f2,y:pko.y+(ptd.y-pko.y)*f2};
        } else if(_isD){
          var offX=25*(i%2===0?1:-1);ptd=project(wx+offX,wy,tdZ);
          cx.strokeStyle='#555';cx.lineWidth=2.5;cx.beginPath();cx.moveTo(ps.x,ps.y);cx.lineTo(ptd.x,ptd.y);cx.stroke();
          var fT=w.pt/w.td,fB=w.pb/w.td;
          ppt={x:ps.x+(ptd.x-ps.x)*fT,y:ps.y+(ptd.y-ps.y)*fT};
          ppb={x:ps.x+(ptd.x-ps.x)*fB,y:ps.y+(ptd.y-ps.y)*fB};
        } else {
          ptd=project(wx,wy,tdZ);
          cx.strokeStyle='#555';cx.lineWidth=2.5;cx.beginPath();cx.moveTo(ps.x,ps.y);cx.lineTo(ptd.x,ptd.y);cx.stroke();
          ppt=project(wx,wy,ptZ);ppb=project(wx,wy,pbZ);
        }
        cx.strokeStyle='#CC2222';cx.lineWidth=6;cx.beginPath();cx.moveTo(ppt.x,ppt.y);cx.lineTo(ppb.x,ppb.y);cx.stroke();
        cx.lineWidth=2;cx.beginPath();cx.moveTo(ppt.x-5,ppt.y);cx.lineTo(ppt.x+5,ppt.y);cx.stroke();cx.beginPath();cx.moveTo(ppb.x-5,ppb.y);cx.lineTo(ppb.x+5,ppb.y);cx.stroke();
        var _wtu=(w.wt||'').toUpperCase(),_pmx=(ppt.x+ppb.x)/2+14,_pmy=(ppt.y+ppb.y)/2;
        var _hasOil=_wtu.indexOf('OIL')>=0,_hasGas=_wtu.indexOf('GAS')>=0,_hasWat=_wtu==='WATER';
        if(_hasOil&&_hasGas){
          cx.fillStyle='#1B5E20';cx.beginPath();cx.moveTo(_pmx,_pmy-14);cx.quadraticCurveTo(_pmx+6,_pmy-5,_pmx+5,_pmy-1);cx.arc(_pmx,_pmy-1,5,0,Math.PI);cx.quadraticCurveTo(_pmx-6,_pmy-5,_pmx,_pmy-14);cx.fill();
          cx.fillStyle='#fff';cx.font='bold 7px Arial';cx.textAlign='center';cx.fillText('O',_pmx,_pmy-2);
          cx.fillStyle='#E65100';cx.beginPath();cx.moveTo(_pmx,_pmy+4);cx.quadraticCurveTo(_pmx+6,_pmy+10,_pmx+4,_pmy+16);cx.quadraticCurveTo(_pmx,_pmy+13,_pmx-4,_pmy+16);cx.quadraticCurveTo(_pmx-6,_pmy+10,_pmx,_pmy+4);cx.fill();
          cx.fillStyle='#FFCC02';cx.beginPath();cx.moveTo(_pmx,_pmy+8);cx.quadraticCurveTo(_pmx+3,_pmy+11,_pmx+2,_pmy+14);cx.quadraticCurveTo(_pmx,_pmy+12,_pmx-2,_pmy+14);cx.quadraticCurveTo(_pmx-3,_pmy+11,_pmx,_pmy+8);cx.fill();
          cx.fillStyle='#fff';cx.font='bold 7px Arial';cx.fillText('G',_pmx,_pmy+14);
        } else if(_hasOil){
          cx.fillStyle='#1B5E20';cx.beginPath();cx.moveTo(_pmx,_pmy-9);cx.quadraticCurveTo(_pmx+7,_pmy-1,_pmx+6,_pmy+3);cx.arc(_pmx,_pmy+3,6,0,Math.PI);cx.quadraticCurveTo(_pmx-7,_pmy-1,_pmx,_pmy-9);cx.fill();
          cx.fillStyle='#fff';cx.font='bold 8px Arial';cx.textAlign='center';cx.fillText('O',_pmx,_pmy+5);
        } else if(_hasGas){
          cx.fillStyle='#E65100';cx.beginPath();cx.moveTo(_pmx,_pmy-9);cx.quadraticCurveTo(_pmx+7,_pmy-1,_pmx+5,_pmy+6);cx.quadraticCurveTo(_pmx,_pmy+3,_pmx-5,_pmy+6);cx.quadraticCurveTo(_pmx-7,_pmy-1,_pmx,_pmy-9);cx.fill();
          cx.fillStyle='#FFCC02';cx.beginPath();cx.moveTo(_pmx,_pmy-4);cx.quadraticCurveTo(_pmx+4,_pmy+1,_pmx+3,_pmy+5);cx.quadraticCurveTo(_pmx,_pmy+2,_pmx-3,_pmy+5);cx.quadraticCurveTo(_pmx-4,_pmy+1,_pmx,_pmy-4);cx.fill();
          cx.fillStyle='#fff';cx.font='bold 8px Arial';cx.textAlign='center';cx.fillText('G',_pmx,_pmy+4);
        } else if(_hasWat){
          cx.fillStyle='#0277BD';cx.beginPath();cx.moveTo(_pmx,_pmy-8);cx.quadraticCurveTo(_pmx+7,_pmy,_pmx+5,_pmy+4);cx.arc(_pmx,_pmy+4,5,0,Math.PI);cx.quadraticCurveTo(_pmx-7,_pmy,_pmx,_pmy-8);cx.fill();
          cx.fillStyle='#fff';cx.font='bold 8px Arial';cx.textAlign='center';cx.fillText('W',_pmx,_pmy+6);
        } else if(_wtu&&_wtu!=='N/A'){
          cx.fillStyle='rgba(0,0,0,0.5)';cx.font='bold 7px Arial';cx.textAlign='left';cx.fillText(_wtu.substring(0,5),_pmx-2,_pmy+3);
        }
        if(w.lmn!=null&&w.lmx!=null){var plmn=project(wx,wy,-w.lmn/MD*BH),plmx=project(wx,wy,-w.lmx/MD*BH);cx.strokeStyle='#1565C0';cx.lineWidth=3;cx.beginPath();cx.moveTo(plmn.x-8,plmn.y);cx.lineTo(plmn.x-8,plmx.y);cx.stroke();cx.lineWidth=2;cx.beginPath();cx.moveTo(plmn.x-12,plmn.y);cx.lineTo(plmn.x-4,plmn.y);cx.stroke();cx.beginPath();cx.moveTo(plmx.x-12,plmx.y);cx.lineTo(plmx.x-4,plmx.y);cx.stroke();}
        cx.fillStyle='#FFD700';cx.beginPath();cx.arc(ptd.x,ptd.y,4,0,Math.PI*2);cx.fill();cx.strokeStyle='#B8960B';cx.lineWidth=1;cx.stroke();
        var dh=28*scale;cx.strokeStyle='#444';cx.lineWidth=1.5;cx.beginPath();cx.moveTo(ps.x-9,ps.y);cx.lineTo(ps.x,ps.y-dh);cx.lineTo(ps.x+9,ps.y);cx.stroke();
        for(var cr=0.25;cr<0.9;cr+=0.25){var cw=9*(1-cr*0.7);cx.beginPath();cx.moveTo(ps.x-cw,ps.y-dh*cr);cx.lineTo(ps.x+cw,ps.y-dh*cr);cx.stroke();}
        cx.fillStyle='#444';cx.fillRect(ps.x-4,ps.y-dh-3,8,3);
        cx.font='bold 10px Arial';var wl=w.nm.substring(0,18),ww=cx.measureText(wl).width;
        _labels.push({x:ps.x,y:ps.y-dh-12,nm:wl,ww:ww,sx:ps.x,sy:ps.y,dh:dh});
        var _lmnY=null,_lmxY=null;if(w.lmn!=null&&w.lmx!=null){_lmnY=project(wx,wy,-w.lmn/MD*BH).y;_lmxY=project(wx,wy,-w.lmx/MD*BH).y;}wSP.push({x:ps.x,y:ps.y,w:w,tdY:ptd.y,lmnY:_lmnY,lmxY:_lmxY});}

      _labels.sort(function(a,b){return a.x-b.x||a.y-b.y;});
      var _LH=16;
      for(var _pass=0;_pass<5;_pass++){
        for(var li=0;li<_labels.length;li++){
          for(var lj=li+1;lj<_labels.length;lj++){
            var la=_labels[li],lb=_labels[lj];
            var oxD=(la.ww+lb.ww)/2+10;
            if(Math.abs(la.x-lb.x)<oxD&&Math.abs(la.y-lb.y)<_LH){
              lb.y=la.y-_LH;
            }
          }
        }
      }
      cx.font='bold 10px Arial';cx.textAlign='center';
      for(var li=0;li<_labels.length;li++){
        var lb=_labels[li],moved=Math.abs(lb.y-(lb.sy-lb.dh-12))>3;
        if(moved){cx.strokeStyle='rgba(80,80,80,0.4)';cx.lineWidth=0.8;cx.setLineDash([2,2]);cx.beginPath();cx.moveTo(lb.sx,lb.sy-lb.dh);cx.lineTo(lb.x,lb.y+7);cx.stroke();cx.setLineDash([]);}
        cx.fillStyle='rgba(255,255,255,0.9)';cx.fillRect(lb.x-lb.ww/2-4,lb.y-5,lb.ww+8,14);
        cx.strokeStyle='rgba(0,0,0,0.15)';cx.lineWidth=0.5;cx.strokeRect(lb.x-lb.ww/2-4,lb.y-5,lb.ww+8,14);
        cx.fillStyle='#1a1a2e';cx.fillText(lb.nm,lb.x,lb.y+5);
      }
      var _isTopView=Math.abs(Math.cos(rotX))<0.25;
      if(!_isTopView){
        var _ctrP=project(0,0,-BH/2);
        var _dc=[{x:-hw,y:-hd},{x:hw,y:-hd},{x:hw,y:hd},{x:-hw,y:hd}],_bestC=_dc[0],_bestDist=-1;
        for(var ci=0;ci<4;ci++){var cp=project(_dc[ci].x,_dc[ci].y,0);var dd=Math.abs(cp.x-_ctrP.x);if(dd>_bestDist){_bestDist=dd;_bestC=_dc[ci];}}
        var _axSc=project(_bestC.x,_bestC.y,0),_outR=_axSc.x>_ctrP.x;
        var dT=project(_bestC.x,_bestC.y,0),dB=project(_bestC.x,_bestC.y,-BH);
        cx.strokeStyle='#000';cx.lineWidth=1.8;cx.beginPath();cx.moveTo(dT.x,dT.y);cx.lineTo(dB.x,dB.y);cx.stroke();
        var _tDir=_outR?1:-1;cx.font='bold 11px Arial';
        for(var dd=0;dd<=MD;dd+=2000){
          var dp2=project(_bestC.x,_bestC.y,-dd/MD*BH);
          cx.strokeStyle='#000';cx.lineWidth=1.2;cx.beginPath();cx.moveTo(dp2.x,dp2.y);cx.lineTo(dp2.x+_tDir*6,dp2.y);cx.stroke();
          var dpL=project(_bestC.x+_tDir*6,_bestC.y,-dd/MD*BH),lbl=dd.toLocaleString();
          cx.textAlign=_outR?'left':'right';var tw=cx.measureText(lbl).width;
          var lx=_outR?dpL.x+3:dpL.x-3;
          cx.fillStyle='rgba(255,255,255,0.9)';cx.fillRect(lx-(_outR?1:tw+3),dpL.y-7,tw+6,15);
          cx.fillStyle='#000';cx.fillText(lbl,lx,dpL.y+4);
        }
      }
      cx.fillStyle='#1a1a2e';cx.font='bold 20px Georgia';cx.textAlign='center';cx.fillText('3D SUBSURFACE BLOCK DIAGRAM',CW/2,28);
      cx.fillStyle='#666';cx.font='12px Arial';cx.fillText(FS+'  •  '+NW+' Wells  •  '+FM.length+' Formations  •  Drag=pan  •  Right-click=rotate  •  Scroll=zoom',CW/2,46);
      if(!fmMode){var lgx=CW-165,lgy=CH-268;cx.fillStyle='rgba(255,255,255,0.92)';cx.beginPath();cx.roundRect(lgx,lgy,155,255,6);cx.fill();cx.strokeStyle='#bbb';cx.lineWidth=1;cx.beginPath();cx.roundRect(lgx,lgy,155,255,6);cx.stroke();
        cx.fillStyle='#333';cx.font='bold 10px Arial';cx.textAlign='left';cx.fillText('LEGEND',lgx+10,lgy+16);
        var lI: any[]=[['Wellbore','#555',2.5],['Perf Interval','#CC2222',5],['Lease Range','#1565C0',3]];
        for(var li=0;li<lI.length;li++){var iy=lgy+32+li*20;cx.strokeStyle=lI[li][1];cx.lineWidth=lI[li][2];cx.beginPath();cx.moveTo(lgx+10,iy);cx.lineTo(lgx+35,iy);cx.stroke();cx.fillStyle='#444';cx.font='10px Arial';cx.fillText(lI[li][0],lgx+42,iy+4);}
        var iy2=lgy+32+3*20;cx.fillStyle='#FFD700';cx.beginPath();cx.arc(lgx+22,iy2,4,0,Math.PI*2);cx.fill();cx.fillStyle='#444';cx.font='10px Arial';cx.fillText('Total Depth',lgx+42,iy2+4);
        iy2+=20;cx.fillStyle='#7A9B4A';cx.fillRect(lgx+12,iy2-5,20,10);cx.fillStyle='#444';cx.fillText('Surface',lgx+42,iy2+4);
        iy2+=20;cx.fillStyle='#5C7830';cx.beginPath();cx.moveTo(lgx+16,iy2+4);cx.lineTo(lgx+22,iy2-6);cx.lineTo(lgx+28,iy2+4);cx.closePath();cx.fill();cx.fillStyle='#6B4826';cx.fillRect(lgx+21,iy2+4,3,5);cx.fillStyle='#444';cx.fillText('Trees',lgx+42,iy2+4);
        cx.strokeStyle='#ccc';cx.lineWidth=0.5;iy2+=18;cx.beginPath();cx.moveTo(lgx+8,iy2);cx.lineTo(lgx+147,iy2);cx.stroke();
        iy2+=14;cx.fillStyle='#333';cx.font='bold 9px Arial';cx.fillText('WELL TYPE',lgx+10,iy2);
        iy2+=14;cx.fillStyle='#1B5E20';cx.beginPath();cx.moveTo(lgx+20,iy2-7);cx.quadraticCurveTo(lgx+26,iy2-1,lgx+25,iy2+2);cx.arc(lgx+20,iy2+2,5,0,Math.PI);cx.quadraticCurveTo(lgx+14,iy2-1,lgx+20,iy2-7);cx.fill();cx.fillStyle='#fff';cx.font='bold 7px Arial';cx.textAlign='center';cx.fillText('O',lgx+20,iy2+1);cx.textAlign='left';cx.fillStyle='#444';cx.font='10px Arial';cx.fillText('Oil',lgx+42,iy2+4);
        iy2+=20;cx.fillStyle='#E65100';cx.beginPath();cx.moveTo(lgx+20,iy2-7);cx.quadraticCurveTo(lgx+26,iy2-1,lgx+24,iy2+4);cx.quadraticCurveTo(lgx+20,iy2+1,lgx+16,iy2+4);cx.quadraticCurveTo(lgx+14,iy2-1,lgx+20,iy2-7);cx.fill();cx.fillStyle='#FFCC02';cx.beginPath();cx.moveTo(lgx+20,iy2-3);cx.quadraticCurveTo(lgx+23,iy2,lgx+22,iy2+3);cx.quadraticCurveTo(lgx+20,iy2+1,lgx+18,iy2+3);cx.quadraticCurveTo(lgx+17,iy2,lgx+20,iy2-3);cx.fill();cx.fillStyle='#fff';cx.font='bold 7px Arial';cx.textAlign='center';cx.fillText('G',lgx+20,iy2+2);cx.textAlign='left';cx.fillStyle='#444';cx.font='10px Arial';cx.fillText('Gas',lgx+42,iy2+4);
        iy2+=20;cx.fillStyle='#0277BD';cx.beginPath();cx.moveTo(lgx+20,iy2-7);cx.quadraticCurveTo(lgx+26,iy2-1,lgx+25,iy2+2);cx.arc(lgx+20,iy2+2,5,0,Math.PI);cx.quadraticCurveTo(lgx+14,iy2-1,lgx+20,iy2-7);cx.fill();cx.fillStyle='#fff';cx.font='bold 7px Arial';cx.textAlign='center';cx.fillText('W',lgx+20,iy2+1);cx.textAlign='left';cx.fillStyle='#444';cx.font='10px Arial';cx.fillText('Water',lgx+42,iy2+4);}
      if(fmMode){
        var PX=15,PY=65,PW=340,rowH=42;
        var PH=FM.length*rowH+70;
        cx.fillStyle='rgba(255,255,255,0.96)';
        cx.beginPath();cx.roundRect(PX,PY,PW,PH,8);cx.fill();
        cx.strokeStyle='#999';cx.lineWidth=1.5;
        cx.beginPath();cx.roundRect(PX,PY,PW,PH,8);cx.stroke();
        cx.fillStyle='#1a1a2e';cx.font='bold 14px Georgia';cx.textAlign='left';
        cx.fillText('STRATIGRAPHIC COLUMN',PX+15,PY+22);
        cx.strokeStyle='#ccc';cx.lineWidth=1;cx.beginPath();cx.moveTo(PX+10,PY+32);cx.lineTo(PX+PW-10,PY+32);cx.stroke();
        cx.fillStyle='#888';cx.font='bold 9px Arial';
        cx.fillText('FORMATION',PX+60,PY+46);
        cx.textAlign='right';cx.fillText('TOP (ft)',PX+PW-90,PY+46);
        cx.fillText('BASE (ft)',PX+PW-15,PY+46);
        cx.textAlign='left';
        for(var fi=0;fi<FM.length;fi++){
          var ry=PY+55+fi*rowH;
          if(fi%2===0){cx.fillStyle='rgba(0,0,0,0.03)';cx.fillRect(PX+5,ry-2,PW-10,rowH);}
          var col=FC[fi%FC.length];
          cx.fillStyle=col;cx.beginPath();cx.roundRect(PX+15,ry+2,32,rowH-10,3);cx.fill();
          cx.strokeStyle='rgba(0,0,0,0.25)';cx.lineWidth=0.8;cx.beginPath();cx.roundRect(PX+15,ry+2,32,rowH-10,3);cx.stroke();
          cx.fillStyle='#1a1a2e';cx.font='bold 13px Arial';cx.textAlign='left';
          cx.fillText(FM[fi].n,PX+58,ry+14);
          cx.fillStyle='#888';cx.font='10px Arial';
          cx.fillText(FM[fi].w+' well'+(FM[fi].w>1?'s':''),PX+58,ry+28);
          var topD=fi===0?0:BD[fi];
          var botD=BD[fi+1];
          cx.fillStyle='#555';cx.font='11px Arial';cx.textAlign='right';
          cx.fillText(Math.round(topD).toLocaleString(),PX+PW-90,ry+16);
          cx.fillText(Math.round(botD).toLocaleString(),PX+PW-15,ry+16);
          cx.fillStyle='#aaa';cx.font='9px Arial';
          cx.fillText('('+Math.round(botD-topD).toLocaleString()+' ft)',PX+PW-45,ry+30);
        }
        cx.strokeStyle='rgba(0,0,0,0.08)';cx.lineWidth=1;
        for(var fi=1;fi<FM.length;fi++){var ry=PY+55+fi*rowH;cx.beginPath();cx.moveTo(PX+10,ry-2);cx.lineTo(PX+PW-10,ry-2);cx.stroke();}
      }
    }
    render();

    function buildSurfaceTip(d: any){
      return '<div style="font-size:13px;font-weight:bold;color:#2E7D32;margin-bottom:4px;border-bottom:2px solid #4CAF50;padding-bottom:4px">' +
        '\u2B06 SURFACE ATTRIBUTES</div>' +
        '<table style="font-size:10px;line-height:1.7;border-collapse:collapse">' +
        '<tr><td style="color:#666;width:105px;font-weight:600">Well Name</td><td style="font-weight:bold">' + d.nm + '</td></tr>' +
        '<tr><td style="color:#666">API (14)</td><td>' + d.api14 + '</td></tr>' +
        '<tr><td style="color:#666">County</td><td>' + d.county + '</td></tr>' +
        '<tr><td style="color:#666">Country</td><td>' + d.country + '</td></tr>' +
        '<tr><td style="color:#666">State/Province</td><td>' + d.state + '</td></tr>' +
        '<tr><td style="color:#666">District</td><td>' + d.district + '</td></tr>' +
        '<tr><td style="color:#666">Basin</td><td>' + d.basin + '</td></tr>' +
        '<tr><td style="color:#666">Operator</td><td>' + d.op + '</td></tr>' +
        '<tr><td style="color:#666">Play</td><td>' + d.play + '</td></tr>' +
        '<tr><td style="color:#666">Region</td><td>' + d.region + '</td></tr>' +
        '<tr><td style="color:#666">Well Type</td><td>' + d.wt + '</td></tr>' +
        '<tr><td style="color:#666">Sec/Twp/Rng</td><td>' + d.str + '</td></tr>' +
        '<tr><td style="color:#666">SHL Lat</td><td>' + (d.shlLat!=null?d.shlLat.toFixed(5)+'\u00b0':'N/A') + '</td></tr>' +
        '<tr><td style="color:#666">SHL Lon</td><td>' + (d.shlLon!=null?d.shlLon.toFixed(5)+'\u00b0':'N/A') + '</td></tr>' +
        '<tr><td style="color:#666">Total Depth</td><td>' + (d.td!=null?Math.round(d.td).toLocaleString()+' ft':'N/A') + '</td></tr>' +
        '</table>';
    }
    function buildBottomTip(d: any){
      var perfInt=(d.pt!=null&&d.pb!=null)?Math.round(d.pb-d.pt).toLocaleString()+' ft':'N/A';
      return '<div style="font-size:13px;font-weight:bold;color:#C62828;margin-bottom:4px;border-bottom:2px solid #EF5350;padding-bottom:4px">' +
        '\u2B07 BOTTOM / WELLBORE ATTRIBUTES</div>' +
        '<div style="font-size:11px;font-weight:bold;color:#333;margin-bottom:4px">' + d.nm + '</div>' +
        '<table style="font-size:10px;line-height:1.7;border-collapse:collapse">' +
        '<tr><td style="color:#666;width:115px;font-weight:600">BHL Lat</td><td>' + (d.bhlLat!=null?d.bhlLat.toFixed(5)+'\u00b0':'N/A') + '</td></tr>' +
        '<tr><td style="color:#666">BHL Lon</td><td>' + (d.bhlLon!=null?d.bhlLon.toFixed(5)+'\u00b0':'N/A') + '</td></tr>' +
        '<tr><td style="color:#666">Well Type</td><td>' + d.wt + '</td></tr>' +
        '<tr><td style="color:#666">Trajectory</td><td>' + d.traj + '</td></tr>' +
        '<tr><td colspan=2 style="border-top:1px solid #ddd;padding-top:3px"></td></tr>' +
        '<tr><td style="color:#CC2222;font-weight:600">Upper Perf</td><td>' + (d.pt!=null?Math.round(d.pt).toLocaleString()+' ft':'N/A') + '</td></tr>' +
        '<tr><td style="color:#CC2222">Lower Perf</td><td>' + (d.pb!=null?Math.round(d.pb).toLocaleString()+' ft':'N/A') + '</td></tr>' +
        '<tr><td style="color:#CC2222">Perf Interval</td><td>' + perfInt + '</td></tr>' +
        '<tr><td style="color:#666">TVD</td><td>' + (d.tvd!=null?Math.round(d.tvd).toLocaleString()+' ft':'N/A') + '</td></tr>' +
        '<tr><td style="color:#666">Total Depth</td><td>' + (d.td!=null?Math.round(d.td).toLocaleString()+' ft':'N/A') + '</td></tr>' +
        '<tr><td colspan=2 style="border-top:1px solid #ddd;padding-top:3px"></td></tr>' +
        '<tr><td style="color:#666">First Prod Date</td><td>' + d.fp + '</td></tr>' +
        '<tr><td style="color:#666">First Prod Month</td><td>' + d.fpm + '</td></tr>' +
        '<tr><td style="color:#666">Last Prod Month</td><td>' + d.lpm + '</td></tr>' +
        '</table>';
    }
    function buildLeaseTip(d: any){
      return '<div style="font-size:13px;font-weight:bold;color:#1565C0;margin-bottom:4px;border-bottom:2px solid #42A5F5;padding-bottom:4px">' +
        '\u2696 LEASE ATTRIBUTES</div>' +
        '<div style="font-size:11px;font-weight:bold;color:#333;margin-bottom:4px">' + d.nm + '</div>' +
        '<table style="font-size:10px;line-height:1.7;border-collapse:collapse">' +
        '<tr><td style="color:#1565C0;width:105px;font-weight:600">Lease Grantee</td><td>' + d.lg + '</td></tr>' +
        '<tr><td style="color:#1565C0">Lease Min Depth</td><td>' + (d.lmn!=null?Math.round(d.lmn).toLocaleString()+' ft':'N/A') + '</td></tr>' +
        '<tr><td style="color:#1565C0">Lease Max Depth</td><td>' + (d.lmx!=null?Math.round(d.lmx).toLocaleString()+' ft':'N/A') + '</td></tr>' +
        '</table>';
    }

    const ttip = document.getElementById('ttip3d');
    const onWinMouseMove = function(e: MouseEvent){
      if(dragging){if(ttip)ttip.style.display='none';return;}
      var rect=cv.getBoundingClientRect(),mx=e.clientX-rect.left,my=e.clientY-rect.top;
      var foundSurf=null,foundBot=null,foundLease=null;
      if(wSP){for(var i=0;i<wSP.length;i++){var wp=wSP[i];
        var dSurf=Math.sqrt(Math.pow(mx-wp.x,2)+Math.pow(my-wp.y,2));
        if(wp.w.lmn!=null&&wp.w.lmx!=null&&wp.lmnY!=null&&wp.lmxY!=null){
          var onLease=Math.abs(mx-(wp.x-8))<10&&my>=Math.min(wp.lmnY,wp.lmxY)-5&&my<=Math.max(wp.lmnY,wp.lmxY)+5;
          if(onLease){foundLease=wp.w;break;}}
        if(dSurf<25&&my<=wp.y+5){foundSurf=wp.w;break;}
        var onLine=Math.abs(mx-wp.x)<14&&my>wp.y+5&&my<=wp.tdY+10;
        if(onLine){foundBot=wp.w;break;}
      }}
      if(ttip) {
        if(foundSurf){
          ttip.innerHTML=buildSurfaceTip(foundSurf);ttip.style.display='block';
          var tx=e.clientX+15,ty=e.clientY-10;if(tx+340>window.innerWidth)tx=e.clientX-350;if(ty+ttip.offsetHeight>window.innerHeight)ty=window.innerHeight-ttip.offsetHeight-10;
          ttip.style.left=tx+'px';ttip.style.top=ty+'px';cv.style.cursor='pointer';
        }else if(foundLease){
          ttip.innerHTML=buildLeaseTip(foundLease);ttip.style.display='block';
          var tx=e.clientX+15,ty=e.clientY-10;if(tx+340>window.innerWidth)tx=e.clientX-350;if(ty+ttip.offsetHeight>window.innerHeight)ty=window.innerHeight-ttip.offsetHeight-10;
          ttip.style.left=tx+'px';ttip.style.top=ty+'px';cv.style.cursor='pointer';
        }else if(foundBot){
          ttip.innerHTML=buildBottomTip(foundBot);ttip.style.display='block';
          var tx=e.clientX+15,ty=e.clientY-10;if(tx+340>window.innerWidth)tx=e.clientX-350;if(ty+ttip.offsetHeight>window.innerHeight)ty=window.innerHeight-ttip.offsetHeight-10;
          ttip.style.left=tx+'px';ttip.style.top=ty+'px';cv.style.cursor='pointer';
        }else{
          ttip.style.display='none';if(!dragging)cv.style.cursor='grab';
        }
      }
    };

    const onWinMouseUp = function(){ dragging=false; cv.style.cursor='grab'; };
    const onContextMenu = function(e: Event){ e.preventDefault(); };
    const onMouseDown = function(e: MouseEvent){ if(e.button===2)e.preventDefault(); dragging=true; lastMX=e.clientX; lastMY=e.clientY; dragBtn=e.button; cv.style.cursor=e.button===2?'crosshair':'move'; };
    const onWheel = function(e: WheelEvent){
      e.preventDefault();var rect=cv.getBoundingClientRect(),mx=e.clientX-rect.left,my=e.clientY-rect.top;
      var f=e.deltaY<0?1.08:0.92,ns=Math.max(0.25,Math.min(2.5,scale*f)),r=ns/scale;
      panX=mx-CW/2-(mx-CW/2-panX)*r;panY=my-CH/2+(CH/2+panY-my)*r;scale=ns;render();
    };

    cv.addEventListener('contextmenu', onContextMenu);
    cv.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onWinMouseMove);
    window.addEventListener('mouseup', onWinMouseUp);
    cv.addEventListener('wheel', onWheel, {passive:false});
    cv.addEventListener('mouseleave',function(){if(ttip)ttip.style.display='none';});

    document.getElementById('rst3d')?.addEventListener('click',function(){rotX=-0.55;rotZ=0.7;scale=0.72;panX=0;panY=-30;if(fmMode){fmMode=false;document.getElementById('fmbtn')?.classList.remove('active');}render();});
    document.getElementById('top3d')?.addEventListener('click',function(){rotX=-1.55;rotZ=0;scale=0.85;panX=0;panY=30;render();});
    document.getElementById('side3d')?.addEventListener('click',function(){rotX=-0.35;rotZ=0;scale=0.72;panX=0;panY=-20;render();});
    document.getElementById('front3d')?.addEventListener('click',function(){rotX=-0.35;rotZ=1.57;scale=0.72;panX=0;panY=-20;render();});
    document.getElementById('fmbtn')?.addEventListener('click',function(){
      var btn=this;
      if(!fmMode){savedView={rX:rotX,rZ:rotZ,s:scale,pX:panX,pY:panY};rotX=-0.25;rotZ=0.05;scale=0.65;panX=200;panY=-10;fmMode=true;btn?.classList.add('active');}
      else{rotX=savedView.rX;rotZ=savedView.rZ;scale=savedView.s;panX=savedView.pX;panY=savedView.pY;fmMode=false;btn?.classList.remove('active');}
      render();
    });

    return () => {
      window.removeEventListener('mousemove', onWinMouseMove);
      window.removeEventListener('mouseup', onWinMouseUp);
    };
  }, [wells]);

  return (
    <div style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", background: "#f0f2f5", zIndex: 9999, display: "flex", flexDirection: "column" }}>
      <div style={{ background: "#161b22", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #30363d" }}>
        <div style={{ color: "#c9d1d9", fontSize: "18px", fontWeight: "bold" }}>Detailed Stratigraphic Block Diagram</div>
        <button onClick={onClose} style={{ background: "#da3633", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}>✕ Close View</button>
      </div>

      <div ref={containerRef} id="wrap3d" style={{ position: "relative", margin: "20px auto", width: "1100px", flex: 1 }}>
        <canvas id="sc3d" width="1100" height="750" style={{ display: "block", background: "#E8E8E8", border: "1px solid #ccc", borderRadius: "8px", cursor: "grab", boxShadow: "0 10px 30px rgba(0,0,0,0.15)" }}></canvas>
        <div id="ctrl3d" style={{ position: "absolute", top: "225px", right: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <button id="fmbtn" style={btnStyle}>🌍 Formations</button>
          <button id="top3d" style={btnStyle}>⬇️ Top View</button>
          <button id="front3d" style={btnStyle}>➡️ Front View</button>
          <button id="side3d" style={btnStyle}>⬅️ Side View</button>
          <button id="rst3d" style={btnStyle}>🔄 Reset</button>
        </div>
        <div id="ttip3d" style={{ position: "fixed", display: "none", background: "rgba(255,255,255,0.97)", padding: "14px", borderRadius: "8px", border: "1px solid #ccc", maxWidth: "350px", zIndex: 10000, boxShadow: "0 6px 24px rgba(0,0,0,0.22)", pointerEvents: "none" }}></div>
      </div>
    </div>
  );
}

const btnStyle = { padding: "8px 16px", border: "1px solid #aaa", borderRadius: "6px", background: "rgba(255,255,255,0.95)", cursor: "pointer", fontSize: "13px", fontWeight: "bold", color: "#444", boxShadow: "0 2px 6px rgba(0,0,0,0.12)" };