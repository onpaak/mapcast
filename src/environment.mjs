export function environmentKind(tags={}){
  const natural=String(tags.natural??'').toLowerCase(),landuse=String(tags.landuse??'').toLowerCase(),leisure=String(tags.leisure??'').toLowerCase();
  if(natural==='water'||tags.water||tags.waterway==='riverbank')return 'water';
  if(natural==='wood'||landuse==='forest')return 'woodland';
  if(['grass','meadow','recreation_ground','village_green','orchard'].includes(landuse)||['park','garden','nature_reserve'].includes(leisure))return 'green';
  return undefined;
}
