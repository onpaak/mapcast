import {glyph} from './pixel-glyphs.mjs';

// Pixel-art placeholder ads for the rooftop billboards, in the same hand-drawn style as the
// signs. Each 256×128 slot uses a different poster layout; all text and products are generic
// and fictional. Everything is deterministic: no randomness beyond seeded hashes.

// Small bitmaps for ad products ('#' ink, '+' accent, 'o' highlight).
const art=rows=>rows.map(r=>[...r].map(c=>c==='#'?1:c==='+'?2:c==='o'?3:0));
const BOTTLE=art([
 '....####....','....#oo#....','....#oo#....','....#oo#....','...##oo##...','..#++++++#..','.#++++++++#.','#+oo++++++#.',
 '#+oo++++++#.','#+o+++++++#.','#+o+++++++#.','#++++++++++#','#+########+#','#+#oooooo#+#','#+#o####o#+#','#+#oooooo#+#',
 '#+########+#','#++++++++++#','#+o+++++++#.','#+o+++++++#.','#++++++++++#','#++++++++++#','.#++++++++#.','..########..'
]);
const MIC=art([
 '...######...','..#oo++++#..','.#o++#+#++#.','.#+#+#+#+#+.','.#++#+#+#++#','.#+#+#+#+#+#','.#++#+#+#++#','..#++++++++#',
 '...######...','....#++#....','....#++#....','....#++#....','....#++#....','....#++#....','....#++#....','....#++#....',
 '...##++##...','..#oooooo#..','..########..'
]);
const NOTE=art(['...##','...#.#','...#..#','...#...','...#...','.###...','####...','.##....']);
const FIGURE=art(['.#.','###','###','.#.','#.#','#.#']);

// Ordered dithering, as on real low-colour console textures.
const BAYER=[[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]].map(r=>r.map(v=>(v+.5)/16));
const hash=(x,y,s)=>((Math.imul(x+7+s,73856093)^Math.imul(y+19,19349663))>>>0)%1000/1000;
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);

function canvas(rgba,atlasSize,rect){
  const {x:ox,y:oy,w,h}=rect;
  const put=(x,y,c,alpha=1)=>{
    x=Math.round(x);y=Math.round(y);if(x<0||y<0||x>=w||y>=h||alpha<=0)return;
    const i=((oy+y)*atlasSize+ox+x)*4;
    for(let k=0;k<3;k++)rgba[i+k]=Math.round(rgba[i+k]*(1-alpha)+c[k]*Math.min(1,alpha));
    rgba[i+3]=255;
  };
  const c={w,h,put};
  c.fill=color=>{for(let y=0;y<h;y++)for(let x=0;x<w;x++)put(x,y,color);};
  // Vertical gradient between colour stops, dithered to a few bands.
  c.gradient=(stops,bands=6)=>{for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const t=y/(h-1)*(stops.length-1),i=Math.min(stops.length-2,Math.floor(t)),f=t-i,q=Math.min(bands,Math.floor(f*bands+BAYER[y%4][x%4]))/bands;
    put(x,y,mix(stops[i],stops[i+1],q));}};
  c.rect=(x0,y0,rw,rh,color,alpha=1)=>{for(let y=y0;y<y0+rh;y++)for(let x=x0;x<x0+rw;x++)put(x,y,color,alpha);};
  c.disc=(cx,cy,r,color,alpha=1)=>{for(let y=Math.floor(cy-r);y<=cy+r;y++)for(let x=Math.floor(cx-r);x<=cx+r;x++)if((x-cx)**2+(y-cy)**2<=r*r)put(x,y,color,alpha);};
  // Elliptical ring with a soft glow falling off on both sides.
  c.ring=(cx,cy,rx,ry,color,width=2,glow=10)=>{for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const d=Math.abs(Math.hypot((x-cx)/rx,(y-cy)/ry)-1)*Math.min(rx,ry);
    if(d<width)put(x,y,color);else if(d<width+glow)put(x,y,color,(1-(d-width)/glow)**2*.55);}};
  c.stamp=(bitmap,x0,y0,scale,colors)=>bitmap.forEach((row,gy)=>row.forEach((v,gx)=>{
    if(v&&colors[v-1])for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++)put(x0+gx*scale+dx,y0+gy*scale+dy,colors[v-1]);}));
  // Pixel text. `slant` shears rows for italics; shadow and outline draw first.
  c.textWidth=(text,scale,spacing=1)=>[...text].reduce((s,ch)=>s+(ch===' '?4:6)*scale+(spacing-1)*scale,0)-spacing*scale;
  c.text=(text,x0,y0,scale,color,{shadow,outline,slant=0,spacing=1,align='left'}={})=>{
    const width=c.textWidth(text,scale,spacing),start=align==='center'?x0-width/2:align==='right'?x0-width:x0;
    const draw=(dx,dy,col)=>{let x=start;for(const ch of text){
      if(ch!==' ')glyph(ch).forEach((row,gy)=>row.forEach((v,gx)=>{if(!v)return;const shear=Math.round((6-gy)*slant*scale);
        for(let sy=0;sy<scale;sy++)for(let sx=0;sx<scale;sx++)put(x+gx*scale+sx+shear+dx,y0+gy*scale+sy+dy,col);}));
      x+=(ch===' '?4:6)*scale+(spacing-1)*scale;}};
    if(outline)for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,1],[-1,1],[1,-1]])draw(dx*Math.max(1,scale/2),dy*Math.max(1,scale/2),outline);
    if(shadow)draw(scale,scale,shadow);
    draw(0,0,color);
  };
  // Small four-pixel diamonds as glints.
  c.glint=(x,y,size,color)=>{for(let d=-size;d<=size;d++){put(x+d,y,color);put(x,y+d,color);}put(x-1,y-1,color,.5);put(x+1,y+1,color,.5);put(x-1,y+1,color,.5);put(x+1,y-1,color,.5);};
  c.grain=amount=>{for(let y=0;y<h;y++)for(let x=0;x<w;x++){const n=(hash(x,y,ox)-.5)*amount;put(x,y,n>0?[255,255,255]:[0,0,0],Math.abs(n));}};
  return c;
}

const ADS=[
  // Soda: headline across the top, the bottle large on the right, bubbles rising.
  c=>{
    c.gradient([[198,46,40],[150,28,34],[96,18,26]]);
    for(let y=6;y<c.h;y+=8)for(let x=(y/8%2)*4;x<c.w;x+=8)c.disc(x,y,1+y/48,[120,20,28],.6);
    c.text('SODA',14,14,6,[255,236,196],{shadow:[90,14,20],slant:.12});
    c.text('ICE COLD',16,74,3,[255,214,150],{spacing:2});
    c.rect(16,100,128,3,[255,214,150]);
    c.stamp(BOTTLE,184,4,5,[[60,16,20],[236,70,52],[255,236,210]]);
    for(let i=0;i<14;i++)c.disc(150+hash(i,1,5)*100,10+hash(i,2,5)*108,1+hash(i,3,5)*3,[255,236,210],.7);
    c.grain(.08);
  },
  // Karaoke: diagonal pink/cyan split, the microphone bleeding off the left, three stacked words.
  c=>{
    for(let y=0;y<c.h;y++)for(let x=0;x<c.w;x++)c.put(x,y,x+y*.55<120?[246,72,160]:[52,196,226]);
    c.stamp(MIC,6,20,6,[[40,24,60],[196,200,214],[255,255,255]]);
    c.text('SING',122,12,4,[255,255,255],{outline:[120,20,90]});
    c.text('ALL',122,48,4,[255,255,255],{outline:[120,20,90]});
    c.text('NIGHT',122,84,4,[255,238,120],{outline:[120,20,90]});
    for(const [x,y] of [[96,14],[232,52],[100,112]])c.stamp(NOTE,x,y,2,[[255,255,255]]);
    for(const [x,y] of [[84,40],[244,20],[214,116],[108,76]])c.glint(x,y,3,[255,255,255]);
  },
  // Film poster: night sky, a glowing ring over a dark planet, a lone figure, wide title below.
  c=>{
    c.gradient([[6,10,30],[14,26,58],[4,6,14]],8);
    for(let i=0;i<60;i++)c.put(hash(i,4,9)*256,hash(i,5,9)*80,[220,230,255],.4+hash(i,6,9)*.6);
    c.disc(128,150,92,[10,14,24]);
    c.ring(128,54,86,16,[120,230,240],2,14);
    c.rect(0,94,256,34,[8,10,18]);
    for(let x=0;x<c.w;x++){const t=1-Math.abs(x-128)/128;c.put(x,93,[120,230,240],.9*t);c.put(x,92,[120,230,240],.4*t);c.put(x,91,[120,230,240],.15*t);}
    c.stamp(FIGURE,125,81,2,[[2,3,6]]);
    c.text('NIGHT ORBIT',128,109,2,[236,244,255],{spacing:3,align:'center'});
    c.text('COMING SOON',128,97,1,[120,150,190],{spacing:2,align:'center'});
  },
  // Handheld game: bright sky with light streaks, product on the left, italic two-line headline, badge mark.
  c=>{
    c.gradient([[120,210,250],[60,150,230],[30,90,190]]);
    for(let k=0;k<6;k++)for(let x=0;x<c.w;x++){const y=Math.round(20+k*20-x*.3);c.put(x,y,[255,255,255],.35);c.put(x,y+1,[255,255,255],.15);}
    c.stamp(glyph('{gamepad}'),6,20,6,[[20,30,70],[240,90,110]]);
    c.text('PLAY',106,18,5,[12,30,96],{slant:.2,shadow:[255,255,255]});
    c.text('ANYWHERE',106,60,3,[12,30,96],{slant:.2,shadow:[255,255,255]});
    c.rect(186,96,58,20,[12,30,96]);c.text('NEW',215,103,1,[255,255,255],{spacing:2,align:'center'});
  },
  // Minimal product: pale ground, small wordmark, centred player, quiet tagline.
  c=>{
    c.gradient([[238,242,246],[214,224,234]],4);
    c.text('SOLO',14,12,2,[40,50,70],{spacing:3});
    for(let x=60;x<196;x++){const t=1-Math.abs(x-128)/68;c.rect(x,112,1,4,[160,170,186],t*.6);}
    // A round personal disc player: silver body, spinning disc window, play button.
    c.disc(124,62,40,[150,160,178]);c.disc(124,62,37,[214,222,232]);c.disc(124,62,26,[70,80,100]);
    c.ring(124,62,18,18,[120,200,230],1,4);c.disc(124,62,5,[214,222,232]);c.disc(124,62,2,[70,80,100]);
    for(let i=0;i<8;i++)c.rect(158-i,60-i/2|0,1,i+1,[240,90,110]);
    c.rect(96,30,14,3,[255,255,255],.8);c.rect(92,34,6,2,[255,255,255],.6);
    c.text('MUSIC',184,50,2,[70,80,100]);c.text('TO GO',184,68,2,[70,80,100]);
  },
  // Late-night noodles: dark ground, yellow corner band, huge bowl bottom right, round badge.
  c=>{
    c.fill([22,18,20]);
    for(let y=0;y<c.h;y++)for(let x=0;x<c.w;x++)if(x+y*1.4<150)c.put(x,y,[250,206,60]);
    c.text('OPEN',12,10,3,[30,20,16]);c.text('LATE',12,36,3,[30,20,16]);
    c.text('HOT NOODLE',14,100,2,[250,206,60],{spacing:2});
    c.stamp(glyph('{bowl}'),140,12,7,[[250,206,60],[240,130,50]]);
    c.disc(226,26,18,[220,52,40]);c.text('24H',226,23,1,[255,255,255],{align:'center'});
  },
  // Coffee: a repeating cup pattern with a label band across the middle.
  c=>{
    c.fill([96,58,40]);
    const cup=glyph('{coffee}');
    for(let y=-4;y<c.h;y+=22)for(let x=((y/22)%2)*14-10;x<c.w;x+=28)c.stamp(cup,x,y,1,[[140,92,64],[140,92,64]]);
    c.rect(0,40,256,48,[244,228,200]);c.rect(0,44,256,1,[96,58,40]);c.rect(0,83,256,1,[96,58,40]);
    c.stamp(cup,16,48,2,[[96,58,40],[200,120,60]]);
    c.text('COFFEE BREAK',62,51,2,[96,58,40],{spacing:2});
    c.text('FRESH ALL DAY',62,70,1,[150,100,70],{spacing:2});
  },
  // Energy drink: dark ground, speed lines, a huge bolt, italic outlined headline.
  c=>{
    c.gradient([[14,30,20],[6,14,10]],4);
    for(let k=0;k<14;k++){const y=Math.floor(hash(k,7,3)*128),len=40+hash(k,8,3)*120,x0=hash(k,9,3)*140;c.rect(Math.floor(x0),y,Math.floor(len),1,[120,250,100],.35);}
    c.stamp(glyph('{bolt}'),8,4,7,[[150,255,90],[60,200,60]]);
    c.text('POWER',106,22,4,[150,255,90],{slant:.25,outline:[10,40,20]});
    c.text('UP',140,62,6,[255,255,255],{slant:.25,outline:[10,40,20]});
  }
];

// Paints all eight slots into an RGBA atlas.
export function paintBillboards(rgba,atlasSize,slotRect){
  ADS.forEach((paint,i)=>paint(canvas(rgba,atlasSize,slotRect(i))));
}
