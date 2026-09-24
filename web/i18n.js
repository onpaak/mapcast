// Page text in English and Simplified Chinese. Static text uses data-i18n="key" (or
// data-i18n-attr="attribute:key;attribute:key"); dynamic text calls t(key, params).
const strings={
  en:{
    pageTitle:'Mapcast · retro street scene generator',tagline:'Retro street scene generator from real map data',help:'Import guide',language:'中文',close:'Close',
    step1:'Choose an area',searchPlaceholder:'Search a place or address',searchButton:'Search',searching:'Searching…',searchNone:'No places found.',searchError:'Search is unavailable: {error}',
    drawBox:'Draw a box',drawArea:'Four corners',cancelDraw:'Cancel drawing',examples:'Examples…',
    helpIdle:'Search a place, pick an example, or draw a box or four corners on the map.',helpFirst:'Click the first corner, then the opposite one. Esc cancels.',
    helpSecond:'Now click the opposite corner.',helpDone:'Area updated.',helpCancelled:'Drawing cancelled.',helpAreaFirst:'Click the four corners in order around the area. Esc cancels.',helpAreaNext:'{count} more to go.',helpAreaInvalid:'The four corners must make a convex shape without crossing edges. Try again.',helpPlaced:'A 400 m area is placed there. Draw again to change it.',
    tileError:'Map tiles are unavailable; you can still type the bounds.',
    size:'Area diagonal {distance} km · limit {limit} km',sizeMissing:'Enter all four bounds.',
    advanced:'Advanced: coordinates and data source',bounds:'Area bounds',areaPoints:'Four corners (longitude, latitude; one per line)',west:'West · longitude',east:'East · longitude',south:'South · latitude',north:'North · latitude',locate:'Show these bounds on the map',
    provider:'Map data source',providerMapApi:'OSM Map API · small areas (≤ 1 km)',providerOverpass:'Overpass · larger areas (≤ 3 km)',
    offline:'Use cached data only',offlineHelp:'Generation uses only map data already downloaded. The map tiles and place search still go online; turn off Map tiles and skip search to keep the page offline too.',
    step2:'Choose a style',detail:'Detail',detailFull:'Full',detailFullHelp:'Modelled shopfronts, doors and street props',
    detailLite:'Lite',detailLiteHelp:'Painted facades, no street props · about a third smaller',
    generate:'Generate scene',generating:'Generating…',
    statusIdle:'',statusStarting:'Starting…',stage_loading:'Reading OpenStreetMap data…',stage_cached:'Building the model and previews…',
    stage_downloaded:'Map downloaded. Building the model and previews…',stage_done:'Done in {seconds} s.',elapsed:'{stage} {seconds} s',
    statusFailed:'Generation failed: {error}',statusChanged:'The area has changed; the result shown is from the previous run.',
    statusNeedResult:'Generate a scene first.',statusNoBuildings:'No buildings were generated; see the details in the result.',
    mapLabel:'Area selection map',tabMap:'Map',tabPreview:'3D result',staleResult:'This is the last generated scene. Generate to see the current selection.',tiles:'Map tiles',day:'Day',night:'Night',
    viewerHint:'Drag to orbit · right-drag to pan · scroll to zoom',viewerLoading:'Loading model… {mb} MB',viewerError:'The 3D preview failed: {error}',noWebgl:'WebGL is unavailable here, so this is a still image.',
    result:'Result',recent:'Recent results',collapse:'Collapse or expand',recentWeb:'{time} · {buildings} buildings',
    emptyResult:'Pick an area and generate. You get one GLB file with textures, lit windows and neon signs, ready for Blender or Unreal.',
    metricBuildings:'Buildings',metricTriangles:'Triangles',metricSize:'File size',options:'{detail} detail',
    download:'Download GLB',deleteResult:'Delete',confirmDelete:'Delete {name} from this computer? This cannot be undone.',statusDeleted:'Result deleted.',deleteFailed:'The result could not be deleted: {error}',credit:'Map data © OpenStreetMap contributors. Keep this credit when you publish.',
    moreFiles:'More files',fileReport:'Diagnostics report (JSON)',fileMap:'Source map (SVG)',fileMetadata:'Metadata (JSON)',fileAttribution:'Attribution (TXT)',
    details:'Details',detailsTypes:'Types: {list}',detailsRoads:'{roads} road objects · {courtyards} buildings with courtyards',detailsEnvironment:'Environment: {list}',
    diagnostics:'{received} building objects read · {outside} outside the area · {generated} generated · {skipped} skipped · {boundary} cross the edge and keep their full outline.',
    diagnosticsMissing:'This result has no building diagnostics; generate it again.',
    emptySkipped:'No buildings were generated because some had missing data or unsupported geometry. See the skipped objects in Details.',
    emptyNone:'No usable building outlines intersect this area. Try a larger area or the other data source.',
    skipped:'Skipped objects',warningCount:'{count} × {reason}',noWarnings:'No objects were skipped.',osmLink:'View on OpenStreetMap',
    helpBlenderTitle:'Blender',helpBlender:'Use File → Import → glTF 2.0 and pick city.glb.',
    helpUnrealTitle:'Unreal Engine',helpUnreal:'Drag city.glb into the Content Browser; the built-in glTF importer needs no plugin. Units convert to centimetres. For first-person walking, enable collision in the import options.',
    helpNightTitle:'Day and night',helpNight:'Windows, signs, lamps and vending machines glow through emissive materials, so bloom picks them up. For a daytime scene, turn their emission down.',
    helpCreditTitle:'Credit',helpCredit:'Map data © OpenStreetMap contributors, available under the Open Database License. Keep this credit with anything you publish; every result includes ATTRIBUTION.txt.',
    helpAboutTitle:'What is real',helpAbout:'Streets, building outlines and heights come from OpenStreetMap. Windows, shopfronts, signs, props and lamps are procedural, and all sign text is fictional. Missing heights are estimated.',
    err_incomplete:'Enter all four bounds.',err_longitudeRange:'Longitude must be between -180 and 180. Western hemisphere longitudes are negative (Washington is about -77).',
    err_latitudeRange:'Latitude must be between -85 and 85.',err_westEast:'West must be less than east. With negative longitudes, the more negative number is further west.',
    err_southNorth:'South must be less than north.',err_notConvex:'The four corners must make a convex shape without crossing edges. Drag a corner to fix it.',err_areaIncomplete:'Enter four corners as longitude, latitude.',err_tooLarge:'The diagonal is {distance} km, over this source’s {limit} km limit. Make the area smaller or switch data source in Advanced.',
    type_residential:'residential',type_house:'house',type_generic:'unknown use',type_office:'office',type_retail:'retail',type_industrial:'industrial',
    type_education:'education',type_hospital:'hospital',type_hotel:'hotel',type_religious:'religious',type_station:'station',type_parking:'parking',type_sports:'sports',type_civic:'civic',
    env_green:'grass / park',env_water:'water',env_woodland:'woodland',
    detail_full:'Full',detail_lite:'Lite'
  },
  zh:{
    pageTitle:'Mapcast · 复古街区场景生成器',tagline:'用真实地图生成复古街区场景',help:'导入说明',language:'English',close:'关闭',
    step1:'选择区域',searchPlaceholder:'搜索地点或地址',searchButton:'搜索',searching:'正在搜索…',searchNone:'没有找到地点。',searchError:'搜索暂不可用：{error}',
    drawBox:'框选矩形',drawArea:'点选四点',cancelDraw:'取消',examples:'示例区域…',
    helpIdle:'搜索地点、选择示例，或在地图上框选矩形、点选四个角。',helpFirst:'点击第一个角，再点击对角；Esc 取消。',
    helpSecond:'现在点击对角，完成选区。',helpDone:'选区已更新。',helpCancelled:'已取消。',helpAreaFirst:'沿选区依次点击四个角；Esc 取消。',helpAreaNext:'还差 {count} 个角。',helpAreaInvalid:'四个角需要围成凸形，边线不能交叉。请重新点选。',helpPlaced:'已在该处放置 400 米的选区，可以重新框选调整。',
    tileError:'在线底图暂不可用；仍可直接输入边界。',
    size:'选区对角线 {distance} km · 上限 {limit} km',sizeMissing:'请输入完整的四个边界。',
    advanced:'高级：坐标与数据来源',bounds:'区域边界',areaPoints:'四个角（经度, 纬度；每行一个）',west:'西 · 经度',east:'东 · 经度',south:'南 · 纬度',north:'北 · 纬度',locate:'在地图上定位边界',
    provider:'地图数据来源',providerMapApi:'OSM 官方接口 · 小街区（≤ 1 km）',providerOverpass:'Overpass · 更大区域（≤ 3 km）',
    offline:'仅用缓存生成',offlineHelp:'生成时只使用已下载的地图数据。在线底图和地点搜索仍会联网；如需整个页面都不联网，请关闭在线底图、不使用搜索。',
    step2:'选择风格',detail:'细节',detailFull:'完整',detailFullHelp:'建模的店面、门和街道道具',
    detailLite:'精简',detailLiteHelp:'全部贴图立面，不放街道道具 · 文件约小三分之一',
    generate:'生成场景',generating:'生成中…',
    statusIdle:'',statusStarting:'正在启动…',stage_loading:'正在读取 OpenStreetMap 数据…',stage_cached:'正在生成模型和预览…',
    stage_downloaded:'地图已下载，正在生成模型和预览…',stage_done:'完成，用时 {seconds} 秒。',elapsed:'{stage} {seconds} 秒',
    statusFailed:'生成失败：{error}',statusChanged:'选区已修改，当前显示的仍是上次的结果。',
    statusNeedResult:'请先生成一个场景。',statusNoBuildings:'本次没有生成建筑，请查看结果中的详细信息。',
    mapLabel:'地图选区',tabMap:'地图',tabPreview:'3D 结果',staleResult:'这是上次生成的场景。当前选区需要点击“生成场景”后才会显示。',tiles:'在线底图',day:'白天',night:'夜晚',
    viewerHint:'拖动旋转 · 右键拖动平移 · 滚轮缩放',viewerLoading:'正在载入模型… {mb} MB',viewerError:'3D 预览失败：{error}',noWebgl:'当前环境不支持 WebGL，显示静态图。',
    result:'生成结果',recent:'最近的结果',collapse:'收起或展开',recentWeb:'{time} · {buildings} 栋建筑',
    emptyResult:'选择区域后点击生成，就会得到一个 GLB 文件，包含贴图、亮灯窗户和霓虹招牌，可直接导入 Blender 或 Unreal。',
    metricBuildings:'建筑',metricTriangles:'三角面',metricSize:'文件大小',options:'{detail}细节',
    download:'下载 GLB',deleteResult:'删除',confirmDelete:'从这台电脑上删除“{name}”？删除后无法恢复。',statusDeleted:'结果已删除。',deleteFailed:'删除失败：{error}',credit:'地图数据 © OpenStreetMap 贡献者。发布作品时请保留此署名。',
    moreFiles:'更多文件',fileReport:'诊断报告（JSON）',fileMap:'源数据对照（SVG）',fileMetadata:'元数据（JSON）',fileAttribution:'署名信息（TXT）',
    details:'详细信息',detailsTypes:'类型：{list}',detailsRoads:'{roads} 个道路对象 · {courtyards} 栋带庭院',detailsEnvironment:'环境：{list}',
    diagnostics:'读取 {received} 个建筑对象 · 区域外 {outside} 个 · 生成 {generated} 个 · 跳过 {skipped} 个 · 跨边界保留完整轮廓 {boundary} 个。',
    diagnosticsMissing:'此结果没有建筑诊断，请重新生成。',
    emptySkipped:'本次没有生成建筑，有建筑因数据缺失或不支持的几何被跳过。请在详细信息中查看跳过的对象。',
    emptyNone:'选区内没有可用的建筑轮廓。请扩大选区，或在高级选项中切换数据来源。',
    skipped:'跳过的对象',warningCount:'{count} 项 · {reason}',noWarnings:'没有跳过的对象。',osmLink:'在 OpenStreetMap 查看',
    helpBlenderTitle:'Blender',helpBlender:'用“文件 → 导入 → glTF 2.0”选择 city.glb 即可。',
    helpUnrealTitle:'Unreal Engine',helpUnreal:'把 city.glb 拖进内容浏览器，使用自带的 glTF 导入，无需插件。单位会自动换算为厘米。做第一人称行走时，请在导入选项中启用碰撞。',
    helpNightTitle:'白天与夜景',helpNight:'窗户、招牌、路灯和售货机使用自发光材质，可以直接触发 bloom。做白天场景时，把它们的自发光调低即可。',
    helpCreditTitle:'署名',helpCredit:'地图数据 © OpenStreetMap 贡献者，采用开放数据库许可（ODbL）。发布作品时请保留此署名；每个结果都附带 ATTRIBUTION.txt。',
    helpAboutTitle:'哪些是真实的',helpAbout:'街道、建筑轮廓和高度来自 OpenStreetMap。窗户、店面、招牌、道具和路灯为程序生成，招牌文字均为虚构。缺失的高度会估算。',
    err_incomplete:'请输入完整的四个边界。',err_longitudeRange:'经度必须在 -180 到 180 之间。西半球经度为负数，例如华盛顿约为 -77。',
    err_latitudeRange:'纬度必须在 -85 到 85 之间。',err_westEast:'西侧经度必须小于东侧；负经度中，更负的数字在西边。',
    err_southNorth:'南侧纬度必须小于北侧纬度。',err_notConvex:'四个角需要围成凸形，边线不能交叉。拖动某个角即可调整。',err_areaIncomplete:'请输入四个角的经度和纬度。',err_tooLarge:'选区对角线 {distance} km，超过当前来源 {limit} km 的上限。请缩小选区，或在高级选项中切换数据来源。',
    type_residential:'住宅',type_house:'独立住宅',type_generic:'用途未知',type_office:'办公',type_retail:'商业',type_industrial:'工业',
    type_education:'教育',type_hospital:'医疗',type_hotel:'酒店',type_religious:'宗教',type_station:'车站',type_parking:'停车',type_sports:'体育',type_civic:'公共建筑',
    env_green:'草地/公园',env_water:'水体',env_woodland:'林地',
    detail_full:'完整',detail_lite:'精简',
    'Missing geometry or unresolved node references':'缺失几何或节点引用不完整','Building is not a closed ring':'建筑轮廓未闭合',
    'Building part is not a closed ring':'建筑分段轮廓未闭合','Building part has no height above its base':'建筑分段没有高于底部的高度',
    'Environment area is not a closed ring':'环境区域轮廓未闭合','Road has no usable surface geometry':'道路没有可用的路面几何',
    'Walking route has no usable geometry':'步行路线没有可用几何','Elevated/underground geometry not supported':'暂不支持高架或地下对象',
    'Underground or indoor building not supported':'暂不支持地下或室内建筑'
  }
};

const stored=(()=>{try{return localStorage.getItem('mapcast-language');}catch{return null;}})();
let language=strings[stored]?stored:navigator.language?.toLowerCase().startsWith('zh')?'zh':'en';

export const getLanguage=()=>language;
export const locale=()=>language==='zh'?'zh-CN':'en';
// Unknown keys fall back to English, then to the key itself (used for raw warning reasons).
export function t(key,params={}){
  const text=strings[language][key]??strings.en[key]??key;
  return text.replace(/\{(\w+)\}/g,(_,name)=>params[name]??'');
}
export function setLanguage(next){
  language=next;try{localStorage.setItem('mapcast-language',next);}catch{}
  applyStatic();
}
export function applyStatic(){
  document.documentElement.lang=locale();document.title=t('pageTitle');
  for(const el of document.querySelectorAll('[data-i18n]'))el.textContent=t(el.dataset.i18n);
  for(const el of document.querySelectorAll('[data-i18n-attr]'))for(const pair of el.dataset.i18nAttr.split(';')){const [attr,key]=pair.split(':');el.setAttribute(attr,t(key));}
}
