import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

export type TowerRecipeInput = {
  id: string
  name: string
  tier: string
}

export type TowerAnimationSpec = {
  core: string
  ring: string
  beacon: string
  glow?: string
  coreY: number
  beaconY: number
  coreRotationY: number
}

type MaterialOptions = {
  metalness?: number
  roughness?: number
  emissive?: THREE.ColorRepresentation
  emissiveIntensity?: number
}

function material(name: string, color: THREE.ColorRepresentation, { metalness = 0, roughness = .5, emissive, emissiveIntensity = 0 }: MaterialOptions = {}) {
  return new THREE.MeshPhysicalMaterial({
    name,
    color,
    metalness,
    roughness,
    emissive: emissive ?? '#000000',
    emissiveIntensity,
    clearcoat: metalness > .45 ? .52 : .22,
    clearcoatRoughness: .16 + roughness * .24,
    iridescence: emissive ? .18 : 0,
    iridescenceIOR: 1.42,
  })
}

function mesh(group: THREE.Group, geometry: THREE.BufferGeometry, surface: THREE.Material, name: string, position: [number, number, number] = [0, 0, 0], rotation: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]) {
  const item = new THREE.Mesh(geometry, surface)
  item.name = name
  item.position.set(...position)
  item.rotation.set(...rotation)
  item.scale.set(...scale)
  group.add(item)
  return item
}

function ring(group: THREE.Group, surface: THREE.Material, radius: number, tube: number, y: number, name: string) {
  mesh(group, new THREE.TorusGeometry(radius, tube, 8, 24), surface, name, [0, y, 0], [Math.PI / 2, 0, 0])
}

function whiteSilverTower() {
  const tower = new THREE.Group()
  tower.name = '白银｜银辉守卫塔'
  const silver = material('银白合金', '#c8d3dc', { metalness: .9, roughness: .2 })
  const darkSilver = material('暗银结构', '#50606d', { metalness: .86, roughness: .28 })
  const ice = material('寒光核心', '#99e9ff', { metalness: .25, roughness: .16, emissive: '#49ccef', emissiveIntensity: .55 })

  mesh(tower, new THREE.CylinderGeometry(.88, 1.02, .18, 8), darkSilver, '八角基座', [0, .09, 0])
  mesh(tower, new THREE.CylinderGeometry(.68, .8, .22, 8), silver, '银色台阶', [0, .29, 0])
  ring(tower, ice, .59, .035, .42, '能量环')
  mesh(tower, new THREE.CylinderGeometry(.32, .5, .72, 6), silver, '守卫塔身', [0, .69, 0])
  mesh(tower, new THREE.OctahedronGeometry(.36, 0), ice, '冰蓝水晶核心', [0, 1.24, 0], [0, .25, 0])
  for (let i = 0; i < 3; i++) {
    const angle = i * Math.PI * 2 / 3
    const x = Math.cos(angle) * .5
    const z = Math.sin(angle) * .5
    mesh(tower, new THREE.ConeGeometry(.13, .85, 4), silver, `银翼尖塔 ${i + 1}`, [x, .92, z], [0, -angle, 0])
  }
  mesh(tower, new THREE.ConeGeometry(.16, .48, 4), ice, '中央信标', [0, 1.65, 0], [0, Math.PI / 4, 0])
  addArtisanDetail(tower, { recipe: { id: 'gemtd_baiyin' }, theme: 'knight', tier: 0, base: darkSilver, frame: silver, accent: ice, core: ice })
  addPrecisionCraft(tower, { recipe: { id: 'gemtd_baiyin' }, theme: 'knight', tier: 0, frame: silver, accent: ice, core: ice, coreY: 1.24, beaconY: 1.65 })
  tower.userData.animationSpec = { core: '冰蓝水晶核心', ring: '能量环', beacon: '中央信标', coreY: 1.24, beaconY: 1.65, coreRotationY: .25 }
  return tower
}

function malachiteTower() {
  const tower = new THREE.Group()
  tower.name = '孔雀石｜绿纹晶簇塔'
  const stone = material('孔雀石深绿', '#0c4d3c', { roughness: .48, metalness: .16 })
  const green = material('孔雀石绿纹', '#24a875', { roughness: .3, metalness: .2, emissive: '#0c5d3e', emissiveIntensity: .25 })
  const mint = material('孔雀石亮纹', '#91f0b4', { roughness: .25, metalness: .18, emissive: '#29975d', emissiveIntensity: .42 })

  mesh(tower, new THREE.CylinderGeometry(.95, 1.03, .18, 10), stone, '岩纹基座', [0, .09, 0])
  mesh(tower, new THREE.CylinderGeometry(.67, .84, .27, 10), green, '绿纹底座', [0, .3, 0])
  ring(tower, mint, .6, .045, .45, '孔雀石环纹')
  mesh(tower, new THREE.DodecahedronGeometry(.46, 0), stone, '原矿核心', [0, .88, 0], [.1, .2, 0])
  mesh(tower, new THREE.ConeGeometry(.28, 1.3, 5), green, '主晶簇', [0, 1.18, 0], [0, .24, 0])
  for (let i = 0; i < 4; i++) {
    const angle = i * Math.PI / 2 + .18
    const x = Math.cos(angle) * .45
    const z = Math.sin(angle) * .45
    mesh(tower, new THREE.ConeGeometry(.16, .76, 5), i % 2 ? mint : green, `侧生晶簇 ${i + 1}`, [x, .82, z], [0, -angle, .28])
  }
  ring(tower, stone, .38, .035, 1.34, '上层岩纹')
  mesh(tower, new THREE.OctahedronGeometry(.2, 0), mint, '晶簇顶点', [0, 1.89, 0], [0, .45, 0])
  addArtisanDetail(tower, { recipe: { id: 'gemtd_kongqueshi' }, theme: 'peacock', tier: 0, base: stone, frame: green, accent: mint, core: green })
  addPrecisionCraft(tower, { recipe: { id: 'gemtd_kongqueshi' }, theme: 'peacock', tier: 0, frame: green, accent: mint, core: green, coreY: 1.18, beaconY: 1.89 })
  tower.userData.animationSpec = { core: '主晶簇', ring: '孔雀石环纹', beacon: '晶簇顶点', coreY: 1.18, beaconY: 1.89, coreRotationY: .24 }
  return tower
}

function starRubyTower() {
  const tower = new THREE.Group()
  tower.name = '星彩红宝石｜星焰炮台'
  const obsidian = material('深红黑曜石', '#2b0b18', { metalness: .5, roughness: .3 })
  const gold = material('赤金星架', '#e3a531', { metalness: .82, roughness: .2 })
  const ruby = material('星彩红宝石', '#db164b', { metalness: .3, roughness: .12, emissive: '#8f0627', emissiveIntensity: .7 })
  const flare = material('星焰光芒', '#ffca68', { metalness: .15, roughness: .18, emissive: '#ff6720', emissiveIntensity: .8 })

  mesh(tower, new THREE.CylinderGeometry(.9, 1.04, .18, 8), obsidian, '黑曜基座', [0, .09, 0])
  mesh(tower, new THREE.CylinderGeometry(.7, .82, .22, 8), gold, '赤金底座', [0, .29, 0])
  ring(tower, ruby, .59, .045, .45, '红宝石能量环')
  mesh(tower, new THREE.CylinderGeometry(.36, .52, .54, 8), obsidian, '炮台支座', [0, .67, 0])
  mesh(tower, new THREE.IcosahedronGeometry(.44, 1), ruby, '星彩红宝石核心', [0, 1.15, 0], [.1, .2, 0])
  for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI / 3
    const x = Math.cos(angle) * .62
    const z = Math.sin(angle) * .62
    const spike = mesh(tower, new THREE.ConeGeometry(.115, .76, 4), i % 2 ? gold : flare, `星芒 ${i + 1}`, [x, 1.16, z], [0, -angle, Math.PI / 2])
    spike.rotateZ(Math.PI / 2)
  }
  mesh(tower, new THREE.ConeGeometry(.14, .56, 4), flare, '星焰冠', [0, 1.76, 0], [0, Math.PI / 4, 0])
  addArtisanDetail(tower, { recipe: { id: 'gemtd_xingcaihongbaoshi' }, theme: 'star', tier: 0, base: obsidian, frame: gold, accent: flare, core: ruby })
  addPrecisionCraft(tower, { recipe: { id: 'gemtd_xingcaihongbaoshi' }, theme: 'star', tier: 0, frame: gold, accent: flare, core: ruby, coreY: 1.15, beaconY: 1.76 })
  const glow = addLuminescence(tower, { recipe: { id: 'gemtd_xingcaihongbaoshi' }, coreY: 1.15 })
  tower.userData.animationSpec = { core: '星彩红宝石核心', ring: '红宝石能量环', beacon: '星焰冠', glow, coreY: 1.15, beaconY: 1.76, coreRotationY: .2 }
  return tower
}

function hashId(id: string) {
  let value = 2166136261
  for (const char of id) value = Math.imul(value ^ char.charCodeAt(0), 16777619)
  return value >>> 0
}

function hsl(hue: number, saturation: number, lightness: number) {
  return new THREE.Color().setHSL((hue % 1 + 1) % 1, saturation, lightness)
}

function addArtisanDetail(tower: THREE.Group, { recipe, theme, tier, base, frame, accent, core }: { recipe: Pick<TowerRecipeInput, "id">; theme: string; tier: number; base: THREE.Material; frame: THREE.Material; accent: THREE.Material; core: THREE.Material }) {
  hashId(recipe.id)
  const count = 6 + tier * 4
  // A shared craft layer keeps every tower readable at game distance while
  // adding physical construction detail for close views: plinths, inlays,
  // rivets and a second, offset filigree ring.
  mesh(tower, new THREE.CylinderGeometry(1.08 + tier * .055, 1.15 + tier * .06, .075, 16), base, '倒角外台阶', [.0, .038, 0])
  ring(tower, frame, .94 + tier * .045, .026, .22, '金属包边环')
  ring(tower, accent, .76 + tier * .04, .018, .31, '发光符文环')
  for (let index = 0; index < count; index++) {
    const angle = index / count * Math.PI * 2
    const radius = .9 + tier * .04
    mesh(tower, new RoundedBoxGeometry(.13, .11, .2, 2, .025), frame, `基座护板 ${index + 1}`, [Math.cos(angle) * radius, .15, Math.sin(angle) * radius], [0, -angle, 0])
    if (index % 2 === 0) mesh(tower, new THREE.OctahedronGeometry(.055, 0), accent, `符文宝石 ${index / 2 + 1}`, [Math.cos(angle) * .77, .35, Math.sin(angle) * .77], [0, angle, 0])
  }
  const buttressCount = 3 + tier
  for (let index = 0; index < buttressCount; index++) {
    const angle = index / buttressCount * Math.PI * 2 + Math.PI / 4
    mesh(tower, new RoundedBoxGeometry(.16, .38 + tier * .035, .18, 2, .03), frame, `结构扶壁 ${index + 1}`, [Math.cos(angle) * .66, .39 + tier * .018, Math.sin(angle) * .66], [0, -angle, 0])
  }

  if (theme === 'volcano') {
    for (let index = 0; index < 9; index++) {
      const angle = index / 9 * Math.PI * 2
      mesh(tower, new THREE.DodecahedronGeometry(.1 + (index % 3) * .025, 0), index % 2 ? base : accent, `熔岩碎石 ${index + 1}`, [Math.cos(angle) * (.74 + (index % 2) * .1), .31, Math.sin(angle) * (.74 + (index % 2) * .1)])
    }
  } else if (theme === 'reactor') {
    for (let index = 0; index < 6; index++) {
      const angle = index * Math.PI / 3
      mesh(tower, new THREE.CylinderGeometry(.06, .06, .07, 8), accent, `反应炉螺栓 ${index + 1}`, [Math.cos(angle) * .43, 1.32, Math.sin(angle) * .43], [Math.PI / 2, 0, 0])
    }
  } else if (theme === 'pyramid' || theme === 'mountain') {
    for (let index = 0; index < 4; index++) mesh(tower, new THREE.BoxGeometry(.12, .12, .12), accent, `祭坛灯火 ${index + 1}`, [Math.cos(index * Math.PI / 2 + .4) * .72, .34, Math.sin(index * Math.PI / 2 + .4) * .72])
  } else if (theme === 'golem' || theme === 'knight') {
    for (let index = 0; index < 8; index++) mesh(tower, new THREE.SphereGeometry(.045, 8, 6), accent, `铆钉 ${index + 1}`, [((index % 4) - 1.5) * .16, .52 + Math.floor(index / 4) * .24, .33])
  } else if (theme === 'coral' || theme === 'wave' || theme === 'pearl') {
    for (let index = 0; index < 6; index++) mesh(tower, new THREE.SphereGeometry(.075, 10, 8), index % 2 ? accent : core, `海洋气泡 ${index + 1}`, [Math.cos(index * 1.047) * .7, .45 + (index % 3) * .16, Math.sin(index * 1.047) * .7])
  } else if (theme === 'crown' || theme === 'star' || theme === 'diamond' || theme === 'prism') {
    for (let index = 0; index < 8; index++) {
      const angle = index * Math.PI / 4
      mesh(tower, new THREE.OctahedronGeometry(.075, 0), index % 2 ? core : accent, `切面镶嵌 ${index + 1}`, [Math.cos(angle) * .73, .48 + (index % 2) * .11, Math.sin(angle) * .73], [0, angle, 0])
    }
  } else if (theme === 'wings' || theme === 'peacock') {
    for (let index = 0; index < 10; index++) mesh(tower, new THREE.SphereGeometry(.05, 8, 6), accent, `羽饰 ${index + 1}`, [((index % 5) - 2) * .18, .6 + Math.floor(index / 5) * .2, .42])
  } else {
    for (let index = 0; index < 6; index++) mesh(tower, new THREE.TetrahedronGeometry(.08, 0), index % 2 ? core : accent, `浮雕晶片 ${index + 1}`, [Math.cos(index * 1.047) * .7, .48 + (index % 2) * .12, Math.sin(index * 1.047) * .7])
  }
}

function beamBetween(group: THREE.Group, from: [number, number, number], to: [number, number, number], radius: number, surface: THREE.Material, name: string) {
  const start = new THREE.Vector3(...from)
  const end = new THREE.Vector3(...to)
  const midpoint = start.clone().add(end).multiplyScalar(.5)
  const item = mesh(group, new THREE.CylinderGeometry(radius, radius, start.distanceTo(end), 8), surface, name, midpoint.toArray() as [number, number, number])
  item.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize())
  return item
}

function addPrecisionCraft(tower: THREE.Group, { recipe, theme, tier, frame, accent, core, coreY, beaconY }: { recipe: Pick<TowerRecipeInput, "id">; theme: string; tier: number; frame: THREE.Material; accent: THREE.Material; core: THREE.Material; coreY: number; beaconY: number }) {
  const value = hashId(recipe.id)
  const radius = .48 + tier * .045
  // Three differently inclined orbital cages give the core a detailed
  // silhouette from every camera angle, rather than only from above.
  const orbitCount = 2 + tier
  for (let index = 0; index < orbitCount; index++) {
    const orbit = mesh(tower, new THREE.TorusGeometry(radius + index * .045, .014 + index * .003, 8, 40), index === 1 ? accent : frame, `精密轨道 ${index + 1}`, [0, coreY, 0], [Math.PI / 2 + index * .46, index * .72, index * .28])
    orbit.rotation.y += (value % 7) * .08
  }
  mesh(tower, new THREE.TorusKnotGeometry(.18 + tier * .02, .02 + tier * .003, 48 + tier * 24, 6 + tier * 2, 2 + Math.min(tier, 1), 3 + tier), accent, '核心花丝结', [0, coreY, 0], [0, .3, 0])
  mesh(tower, new THREE.OctahedronGeometry(.15 + tier * .02, 1 + tier), core, '多层内晶核', [0, coreY, 0], [0, .2, 0])

  const supportCount = 4 + tier * 2
  for (let index = 0; index < supportCount; index++) {
    const angle = index / supportCount * Math.PI * 2 + (value % 5) * .08
    const start: [number, number, number] = [Math.cos(angle) * .74, .34, Math.sin(angle) * .74]
    const end: [number, number, number] = [Math.cos(angle) * (.42 + tier * .03), coreY - .1, Math.sin(angle) * (.42 + tier * .03)]
    beamBetween(tower, start, end, .022, index % 2 ? frame : accent, `辐射支撑 ${index + 1}`)
    mesh(tower, new THREE.SphereGeometry(.045, 10, 8), accent, `支撑端子 ${index + 1}`, end)
  }
  const filigreeCount = 2 + tier
  for (let index = 0; index < filigreeCount; index++) {
    const angle = index / filigreeCount * Math.PI * 2 + Math.PI / 4
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(Math.cos(angle) * .8, .22, Math.sin(angle) * .8),
      new THREE.Vector3(Math.cos(angle) * .95, .62 + tier * .05, Math.sin(angle) * .95),
      new THREE.Vector3(Math.cos(angle) * .53, beaconY - .3, Math.sin(angle) * .53),
    ])
    mesh(tower, new THREE.TubeGeometry(curve, 20, .018, 6, false), frame, `弧形花丝 ${index + 1}`)
  }
  if (theme === 'reactor' || theme === 'golem' || theme === 'knight') {
    for (let index = 0; index < 2 + tier; index++) mesh(tower, new THREE.TorusGeometry(.22 + index * .07, .015, 8, 24 + tier * 8), accent, `机械刻度环 ${index + 1}`, [0, .55 + index * .19, 0], [Math.PI / 2, 0, 0])
  } else if (theme === 'volcano' || theme === 'coral' || theme === 'mountain') {
    for (let index = 0; index < 3 + tier * 2; index++) {
      const angle = index / (3 + tier * 2) * Math.PI * 2
      mesh(tower, new THREE.ConeGeometry(.045, .34 + (index % 2) * .12, 5), accent, `自然细簇 ${index + 1}`, [Math.cos(angle) * .67, .7, Math.sin(angle) * .67], [0, angle, .32])
    }
  } else {
    for (let index = 0; index < 3 + tier * 2; index++) {
      const angle = index / (3 + tier * 2) * Math.PI * 2
      mesh(tower, new THREE.TetrahedronGeometry(.075, 1), index % 2 ? core : accent, `悬浮微晶 ${index + 1}`, [Math.cos(angle) * .75, .75 + (index % 2) * .14, Math.sin(angle) * .75])
    }
  }
}

const towerThemes: Record<string, string> = {
  gemtd_yu: 'lotus', gemtd_furongshi: 'lotus', gemtd_heianfeicui: 'golem', gemtd_huangcailanbaoshi: 'prism',
  gemtd_palayibabixi: 'wave', gemtd_heisemaoyanshi: 'eye', gemtd_jin: 'pyramid', gemtd_fenhongzuanshi: 'diamond',
  gemtd_jixueshi: 'totem', gemtd_you238: 'reactor', gemtd_baiyinqishi: 'knight', gemtd_xianyandekongqueshi: 'peacock',
  gemtd_xuehonghuoshan: 'volcano', gemtd_shenhaizhenzhu: 'pearl', gemtd_haiyangqingyu: 'wave', gemtd_jixiangdezhongguoyu: 'shrine',
  gemtd_juxingfenhongzuanshi: 'diamond', gemtd_you235: 'reactor', gemtd_jingxindiaozhuodepalayibabixi: 'prism',
  gemtd_gudaidejixueshi: 'totem', gemtd_mirendeqingjinshi: 'shrine', gemtd_aijijin: 'pyramid', gemtd_hongshanhu: 'coral',
  gemtd_feicuimoxiang: 'golem', gemtd_huaguoshanxiandan: 'cauldron', gemtd_tianranzumulv: 'crystal', gemtd_haibao: 'pearl',
  gemtd_keyinuoerguangmingzhishan: 'mountain', gemtd_shuaibiankaipayou: 'reactor', gemtd_heiwangzihuangguanhongbaoshi: 'crown',
  gemtd_xingguanglanbaoshi: 'star', gemtd_yijiazhishi: 'eye', gemtd_huguoshenyishi: 'wings', gemtd_jingangshikulinan: 'diamond',
  gemtd_sililankazhixing: 'star',
}

const luminescentTowers: Record<string, string> = {
  gemtd_xingcaihongbaoshi: 'ruby', gemtd_xuehonghuoshan: 'lava', gemtd_heiwangzihuangguanhongbaoshi: 'ruby',
  gemtd_you238: 'reactor', gemtd_you235: 'reactor', gemtd_shuaibiankaipayou: 'reactor',
  gemtd_keyinuoerguangmingzhishan: 'sun', gemtd_xingguanglanbaoshi: 'star', gemtd_sililankazhixing: 'star',
  gemtd_shenhaizhenzhu: 'pearl', gemtd_haibao: 'pearl', gemtd_yijiazhishi: 'eye', gemtd_heisemaoyanshi: 'eye',
}

function addLuminescence(tower: THREE.Group, { recipe, kind, coreY }: { recipe: Pick<TowerRecipeInput, "id">; kind?: string; coreY: number }) {
  const type = kind || luminescentTowers[recipe.id]
  if (!type) return undefined
  const palette: Record<string, [string, string]> = {
    ruby: ['#ff245f', '#7a001d'], lava: ['#ff6b18', '#8a1100'], reactor: ['#6dff86', '#0a6c33'],
    sun: ['#fff1a1', '#e8a51d'], star: ['#a9dcff', '#2368ff'], pearl: ['#b8fff5', '#1f9faa'], eye: ['#d6ff56', '#5a9d0a'],
  }
  const options = palette[type]
  if (!options) return undefined
  const glowName = `自发光核心-${recipe.id}`
  const glowMaterial = new THREE.MeshPhysicalMaterial({
    name: `${type}自发光材质`, color: options[0], emissive: options[1], emissiveIntensity: 2.8,
    metalness: .05, roughness: .12, transparent: true, opacity: .58, depthWrite: false,
    clearcoat: .75, clearcoatRoughness: .08,
  })
  const glowGeometry = type === 'eye' ? new THREE.SphereGeometry(.24, 20, 12) : new THREE.IcosahedronGeometry(type === 'pearl' ? .29 : .24, 2)
  mesh(tower, glowGeometry, glowMaterial, glowName, [0, coreY, 0], [0, .2, 0], type === 'eye' ? [1.45, .58, .45] : [1, 1, 1])
  const light = new THREE.PointLight(options[0], type === 'sun' ? 2.2 : 1.45, type === 'reactor' ? 3.8 : 3.1, 2)
  light.name = `${type}辉光灯`
  light.position.set(0, coreY, 0)
  tower.add(light)
  if (type === 'lava' || type === 'reactor') {
    for (let index = 0; index < 4; index++) {
      const angle = index * Math.PI / 2
      mesh(tower, new THREE.CylinderGeometry(.025, .055, .48, 6), glowMaterial, `能量导流 ${index + 1}`, [Math.cos(angle) * .44, coreY - .12, Math.sin(angle) * .44], [0, 0, Math.PI / 2])
    }
  } else if (type === 'star' || type === 'sun') {
    for (let index = 0; index < 6; index++) mesh(tower, new THREE.ConeGeometry(.035, .5, 4), glowMaterial, `星光束 ${index + 1}`, [Math.cos(index * Math.PI / 3) * .42, coreY, Math.sin(index * Math.PI / 3) * .42], [0, -index * Math.PI / 3, Math.PI / 2])
  } else if (type === 'pearl') {
    for (let index = 0; index < 2; index++) ring(tower, glowMaterial, .37 + index * .11, .012, coreY + index * .07, `珠光晕环 ${index + 1}`)
  }
  return glowName
}

function generatedRecipeTower(recipe: TowerRecipeInput) {
  const tower = new THREE.Group()
  tower.name = `${recipe.name}｜${towerThemes[recipe.id] || 'crystal'}主题塔`
  const value = hashId(recipe.id)
  const tierLevels: Record<string, number> = { basic: 0, intermediate: 1, advanced: 2, super: 3 }
  const tier = tierLevels[recipe.tier] ?? 0
  const hue = (value % 360) / 360
  const theme = towerThemes[recipe.id] || 'crystal'
  const coreName = `核心-${recipe.id}`, ringName = `能量环-${recipe.id}`, beaconName = `冠冕-${recipe.id}`
  const base = material('主题基座', hsl(hue + .04, .34, .2), { metalness: .58, roughness: .3 })
  const frame = material('主题框架', hsl(hue + .12, .56, .4), { metalness: .7, roughness: .2 })
  const accent = material('主题辉光', hsl(hue + .48, .72, .6), { metalness: .3, roughness: .16, emissive: hsl(hue + .48, .7, .24), emissiveIntensity: .65 })
  const core = material('主题核心', hsl(hue, .8, .54), { metalness: .25, roughness: .1, emissive: hsl(hue, .76, .25), emissiveIntensity: .9 })
  let coreY = 1.15, beaconY = 1.75
  const baseDisk = () => mesh(tower, new THREE.CylinderGeometry(.92 + tier * .05, 1.06 + tier * .06, .18, 8), base, '主题地台', [0, .09, 0])
  const addRing = (y = .55, radius = .58) => ring(tower, accent, radius, .04, y, ringName)
  const finish = () => {
    addArtisanDetail(tower, { recipe, theme, tier, base, frame, accent, core })
    addPrecisionCraft(tower, { recipe, theme, tier, frame, accent, core, coreY, beaconY })
    const glow = addLuminescence(tower, { recipe, coreY })
    tower.userData.animationSpec = { core: coreName, ring: ringName, beacon: beaconName, glow, coreY, beaconY, coreRotationY: (value % 10) * .1 }
    return tower
  }

  if (theme === 'volcano') {
    mesh(tower, new THREE.ConeGeometry(1.02, 1.15, 9), base, '火山锥体', [0, .55, 0])
    mesh(tower, new THREE.CylinderGeometry(.42, .32, .18, 10), frame, '熔岩火山口', [0, 1.12, 0])
    coreY = 1.25; beaconY = 1.85; addRing(1.15, .4)
    mesh(tower, new THREE.IcosahedronGeometry(.31, 1), core, coreName, [0, coreY, 0])
    for (let i = 0; i < 4; i++) mesh(tower, new THREE.ConeGeometry(.1, .8, 4), accent, `喷发岩柱 ${i + 1}`, [Math.cos(i * 1.57) * .66, .72, Math.sin(i * 1.57) * .66], [0, i * 1.57, .65])
    mesh(tower, new THREE.ConeGeometry(.12, .55, 4), accent, beaconName, [0, beaconY, 0])
  } else if (theme === 'reactor') {
    mesh(tower, new THREE.BoxGeometry(1.45, .24, 1.45), base, '反应炉平台', [0, .12, 0], [0, .2, 0])
    mesh(tower, new THREE.CylinderGeometry(.38, .55, 1.15, 12), frame, '反应炉压力舱', [0, .75, 0])
    coreY = .92; beaconY = 1.65; addRing(.92, .55)
    mesh(tower, new THREE.SphereGeometry(.31, 12, 8), core, coreName, [0, coreY, 0])
    for (let i = 0; i < 4; i++) mesh(tower, new THREE.CylinderGeometry(.09, .09, .8, 6), accent, `冷却管 ${i + 1}`, [Math.cos(i * 1.57) * .62, .55, Math.sin(i * 1.57) * .62], [0, 0, Math.PI / 2])
    mesh(tower, new THREE.CylinderGeometry(.11, .18, .5, 6), accent, beaconName, [0, beaconY, 0])
  } else if (theme === 'knight') {
    baseDisk(); mesh(tower, new THREE.BoxGeometry(.62, .78, .42), frame, '白银骑士胸甲', [0, .72, 0])
    coreY = .83; beaconY = 1.88; addRing(.82, .42)
    mesh(tower, new THREE.OctahedronGeometry(.24, 0), core, coreName, [0, coreY, .26])
    mesh(tower, new THREE.BoxGeometry(.42, .36, .4), base, '骑士头盔', [0, 1.3, 0])
    mesh(tower, new THREE.ConeGeometry(.08, .65, 4), accent, '骑士长枪', [.52, 1.1, 0], [0, 0, -Math.PI / 2])
    mesh(tower, new THREE.CylinderGeometry(.09, .15, .5, 5), accent, beaconName, [0, beaconY, 0])
  } else if (theme === 'pyramid') {
    mesh(tower, new THREE.ConeGeometry(1.05, 1.3, 4), base, '阶梯金字塔', [0, .65, 0], [0, Math.PI / 4, 0])
    mesh(tower, new THREE.BoxGeometry(1.15, .18, 1.15), frame, '神殿台阶', [0, .16, 0], [0, Math.PI / 4, 0])
    coreY = 1.36; beaconY = 1.92; addRing(1.1, .46)
    mesh(tower, new THREE.OctahedronGeometry(.32, 0), core, coreName, [0, coreY, 0])
    mesh(tower, new THREE.ConeGeometry(.1, .45, 4), accent, beaconName, [0, beaconY, 0], [0, Math.PI / 4, 0])
  } else if (theme === 'golem') {
    baseDisk(); mesh(tower, new THREE.BoxGeometry(.82, .8, .58), frame, '魔像躯体', [0, .7, 0])
    coreY = .78; beaconY = 1.72; addRing(.77, .45)
    mesh(tower, new THREE.DodecahedronGeometry(.28, 0), core, coreName, [0, coreY, .34])
    mesh(tower, new THREE.BoxGeometry(.52, .42, .48), base, '魔像头部', [0, 1.34, 0])
    for (const x of [-.62, .62]) mesh(tower, new THREE.BoxGeometry(.22, .55, .3), frame, '魔像手臂', [x, .77, 0])
    mesh(tower, new THREE.ConeGeometry(.12, .45, 4), accent, beaconName, [0, beaconY, 0])
  } else if (theme === 'coral') {
    mesh(tower, new THREE.SphereGeometry(.86, 12, 8), base, '珊瑚礁座', [0, .35, 0], [0, 0, 0], [1, .55, 1])
    coreY = .9; beaconY = 1.8; addRing(.8, .62)
    mesh(tower, new THREE.SphereGeometry(.3, 10, 8), core, coreName, [0, coreY, 0])
    for (let i = 0; i < 6; i++) mesh(tower, new THREE.CylinderGeometry(.07, .12, .75 + (i % 2) * .28, 6), i % 2 ? frame : accent, `珊瑚枝 ${i + 1}`, [Math.cos(i * 1.047) * .52, .75, Math.sin(i * 1.047) * .52], [Math.sin(i) * .35, 0, Math.cos(i) * .35])
    mesh(tower, new THREE.SphereGeometry(.13, 8, 6), accent, beaconName, [0, beaconY, 0])
  } else if (theme === 'wings') {
    baseDisk(); mesh(tower, new THREE.CylinderGeometry(.25, .42, .85, 6), frame, '神翼石柱', [0, .68, 0])
    coreY = 1.15; beaconY = 1.85; addRing(1.15, .43)
    mesh(tower, new THREE.OctahedronGeometry(.34, 0), core, coreName, [0, coreY, 0])
    for (const x of [-1, 1]) mesh(tower, new THREE.ConeGeometry(.36, 1.25, 4), accent, '展开神翼', [x * .48, 1.15, 0], [0, 0, x * Math.PI / 2], [.55, 1, 1])
    mesh(tower, new THREE.ConeGeometry(.12, .52, 4), accent, beaconName, [0, beaconY, 0])
  } else if (theme === 'crown') {
    mesh(tower, new THREE.CylinderGeometry(.82, 1.03, .28, 8), base, '皇冠底座', [0, .14, 0])
    coreY = .9; beaconY = 1.88; addRing(.88, .57)
    mesh(tower, new THREE.IcosahedronGeometry(.31, 1), core, coreName, [0, coreY, 0])
    for (let i = 0; i < 6; i++) mesh(tower, new THREE.ConeGeometry(.13, .8, 4), i % 2 ? frame : accent, `皇冠尖齿 ${i + 1}`, [Math.cos(i * 1.047) * .58, 1.13, Math.sin(i * 1.047) * .58])
    mesh(tower, new THREE.OctahedronGeometry(.15, 0), accent, beaconName, [0, beaconY, 0])
  } else if (theme === 'eye') {
    mesh(tower, new THREE.CylinderGeometry(1.0, 1.0, .18, 12), base, '瞳孔祭坛', [0, .09, 0])
    coreY = .85; beaconY = 1.58; addRing(.83, .66)
    mesh(tower, new THREE.SphereGeometry(.48, 16, 10), core, coreName, [0, coreY, 0], [0, 0, 0], [1.35, .55, 1])
    mesh(tower, new THREE.SphereGeometry(.2, 12, 8), base, '竖瞳', [0, coreY, .34], [0, 0, 0], [.42, 1.2, .25])
    mesh(tower, new THREE.OctahedronGeometry(.13, 0), accent, beaconName, [0, beaconY, 0])
  } else if (theme === 'wave' || theme === 'pearl') {
    mesh(tower, new THREE.CylinderGeometry(.98, 1.06, .16, 12), base, '海潮底座', [0, .08, 0])
    coreY = 1.03; beaconY = 1.78; addRing(.75, .65)
    mesh(tower, new THREE.SphereGeometry(theme === 'pearl' ? .4 : .32, 14, 10), core, coreName, [0, coreY, 0])
    for (let i = 0; i < (theme === 'pearl' ? 3 : 5); i++) mesh(tower, new THREE.TorusGeometry(.38 + i * .05, .05, 6, 16, Math.PI), i % 2 ? frame : accent, `浪潮 ${i + 1}`, [0, .44 + i * .13, 0], [0, i * .55, 0])
    mesh(tower, new THREE.ConeGeometry(.12, .45, 4), accent, beaconName, [0, beaconY, 0])
  } else if (theme === 'shrine') {
    mesh(tower, new THREE.BoxGeometry(1.2, .18, 1.05), base, '神社台基', [0, .09, 0])
    for (const x of [-.48, .48]) for (const z of [-.35, .35]) mesh(tower, new THREE.CylinderGeometry(.07, .09, .92, 6), frame, '神社立柱', [x, .58, z])
    mesh(tower, new THREE.ConeGeometry(.82, .42, 4), frame, '飞檐屋顶', [0, 1.13, 0], [0, Math.PI / 4, 0], [1, .7, 1])
    coreY = 1.35; beaconY = 1.9; addRing(1.34, .4)
    mesh(tower, new THREE.OctahedronGeometry(.27, 0), core, coreName, [0, coreY, 0])
    mesh(tower, new THREE.ConeGeometry(.1, .4, 4), accent, beaconName, [0, beaconY, 0])
  } else if (theme === 'mountain') {
    mesh(tower, new THREE.ConeGeometry(1.15, 1.55, 7), base, '光明之山', [0, .77, 0])
    coreY = 1.45; beaconY = 2.15; addRing(1.45, .48)
    mesh(tower, new THREE.OctahedronGeometry(.34, 0), core, coreName, [0, coreY, 0])
    for (let i = 0; i < 3; i++) mesh(tower, new THREE.ConeGeometry(.28, .9, 5), frame, `山脊 ${i + 1}`, [Math.cos(i * 2.1) * .6, .58, Math.sin(i * 2.1) * .6])
    mesh(tower, new THREE.ConeGeometry(.13, .6, 4), accent, beaconName, [0, beaconY, 0])
  } else if (theme === 'star' || theme === 'diamond' || theme === 'prism') {
    baseDisk(); coreY = 1.2; beaconY = 1.9; addRing(1.18, .6)
    mesh(tower, theme === 'diamond' ? new THREE.OctahedronGeometry(.52, 0) : new THREE.IcosahedronGeometry(.42, 1), core, coreName, [0, coreY, 0])
    const count = theme === 'star' ? 8 : theme === 'diamond' ? 4 : 6
    for (let i = 0; i < count; i++) mesh(tower, new THREE.ConeGeometry(.1, theme === 'star' ? .95 : .68, 4), i % 2 ? frame : accent, `放射棱面 ${i + 1}`, [Math.cos(i / count * Math.PI * 2) * .58, 1.2, Math.sin(i / count * Math.PI * 2) * .58], [0, -i / count * Math.PI * 2, Math.PI / 2])
    mesh(tower, new THREE.OctahedronGeometry(.14, 0), accent, beaconName, [0, beaconY, 0])
  } else if (theme === 'cauldron') {
    mesh(tower, new THREE.SphereGeometry(.72, 12, 8), base, '仙丹炉', [0, .62, 0], [0, 0, 0], [1, .75, 1])
    coreY = 1.08; beaconY = 1.8; addRing(1.06, .55)
    mesh(tower, new THREE.SphereGeometry(.32, 12, 8), core, coreName, [0, coreY, 0])
    for (let i = 0; i < 3; i++) mesh(tower, new THREE.CylinderGeometry(.07, .1, .42, 5), frame, `丹炉支脚 ${i + 1}`, [Math.cos(i * 2.1) * .5, .18, Math.sin(i * 2.1) * .5], [0, 0, .45])
    mesh(tower, new THREE.ConeGeometry(.11, .5, 4), accent, beaconName, [0, beaconY, 0])
  } else if (theme === 'lotus') {
    baseDisk(); coreY = .95; beaconY = 1.72; addRing(.92, .58)
    mesh(tower, new THREE.SphereGeometry(.3, 12, 8), core, coreName, [0, coreY, 0])
    for (let i = 0; i < 8; i++) mesh(tower, new THREE.ConeGeometry(.23, .75, 4), i % 2 ? accent : frame, `莲瓣 ${i + 1}`, [Math.cos(i * .785) * .43, .62, Math.sin(i * .785) * .43], [0, -i * .785, Math.PI / 2])
    mesh(tower, new THREE.ConeGeometry(.1, .45, 4), accent, beaconName, [0, beaconY, 0])
  } else if (theme === 'totem') {
    baseDisk(); coreY = 1.1; beaconY = 1.98; addRing(1.08, .48)
    mesh(tower, new THREE.CylinderGeometry(.26, .35, 1.3, 6), frame, '古代图腾柱', [0, .85, 0])
    mesh(tower, new THREE.DodecahedronGeometry(.3, 0), core, coreName, [0, coreY, .2])
    for (let y = .5; y < 1.5; y += .33) mesh(tower, new THREE.TorusGeometry(.31, .03, 6, 12), accent, '图腾箍', [0, y, 0], [Math.PI / 2, 0, 0])
    mesh(tower, new THREE.ConeGeometry(.12, .54, 4), accent, beaconName, [0, beaconY, 0])
  } else if (theme === 'peacock') {
    baseDisk(); coreY = 1.02; beaconY = 1.88; addRing(1.0, .48)
    mesh(tower, new THREE.SphereGeometry(.34, 12, 8), core, coreName, [0, coreY, 0])
    for (let i = 0; i < 7; i++) mesh(tower, new THREE.SphereGeometry(.19, 10, 6), i % 2 ? accent : frame, `孔雀尾羽 ${i + 1}`, [(i - 3) * .23, 1.3 + Math.abs(i - 3) * .08, .26], [0, 0, 0], [.65, 1.55, .3])
    mesh(tower, new THREE.ConeGeometry(.1, .52, 4), accent, beaconName, [0, beaconY, 0])
  } else { // crystal
    baseDisk(); coreY = 1.2; beaconY = 1.92; addRing(1.16, .58)
    mesh(tower, new THREE.DodecahedronGeometry(.42, 0), core, coreName, [0, coreY, 0])
    for (let i = 0; i < 5; i++) mesh(tower, new THREE.ConeGeometry(.15, .9, 5), i % 2 ? frame : accent, `天然晶簇 ${i + 1}`, [Math.cos(i * 1.256) * .52, .85, Math.sin(i * 1.256) * .52])
    mesh(tower, new THREE.OctahedronGeometry(.14, 0), accent, beaconName, [0, beaconY, 0])
  }
  return finish()
}

function vectorTrack(nodeName: string, property: string, times: number[], values: number[]) {
  return new THREE.VectorKeyframeTrack(`${nodeName}.${property}`, times, values)
}

function quaternionTrack(nodeName: string, times: number[], eulers: Array<[number, number, number]>) {
  const values = eulers.flatMap(([x, y, z]) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)).toArray())
  return new THREE.QuaternionKeyframeTrack(`${nodeName}.quaternion`, times, values)
}

export function createTowerAnimations(tower: THREE.Object3D) {
  const spec = tower.userData.animationSpec as TowerAnimationSpec | undefined
  if (!spec) throw new Error(`No animation specification for ${tower.name}`)

  // All clips begin and end at their rest pose. This makes the attack clip
  // safe to trigger from idle in engines using either clamp or cross-fade.
  const idleTracks = [
    quaternionTrack(spec.core, [0, 2], [[0, spec.coreRotationY, 0], [0, spec.coreRotationY + Math.PI * 2, 0]]),
    quaternionTrack(spec.ring, [0, 2], [[Math.PI / 2, 0, 0], [Math.PI / 2, -Math.PI * 2, 0]]),
    vectorTrack(spec.core, 'scale', [0, 1, 2], [1, 1, 1, 1.06, 1.06, 1.06, 1, 1, 1]),
    vectorTrack(spec.beacon, 'position', [0, 1, 2], [0, spec.beaconY, 0, 0, spec.beaconY + .06, 0, 0, spec.beaconY, 0]),
  ]
  const attackTracks = [
    vectorTrack(spec.core, 'position', [0, .16, .36, .72], [0, spec.coreY, 0, 0, spec.coreY - .07, 0, 0, spec.coreY + .2, 0, 0, spec.coreY, 0]),
    vectorTrack(spec.core, 'scale', [0, .16, .36, .72], [1, 1, 1, .82, .82, .82, 1.38, 1.38, 1.38, 1, 1, 1]),
    quaternionTrack(spec.core, [0, .16, .36, .72], [[0, spec.coreRotationY, 0], [0, spec.coreRotationY + .35, 0], [0, spec.coreRotationY + Math.PI * 2.3, 0], [0, spec.coreRotationY + Math.PI * 2.5, 0]]),
    vectorTrack(spec.beacon, 'position', [0, .36, .72], [0, spec.beaconY, 0, 0, spec.beaconY + .18, 0, 0, spec.beaconY, 0]),
    vectorTrack(spec.ring, 'scale', [0, .36, .72], [1, 1, 1, 1.34, 1.34, 1.34, 1, 1, 1]),
  ]
  if (spec.glow) {
    idleTracks.push(vectorTrack(spec.glow, 'scale', [0, .5, 1, 1.5, 2], [1, 1, 1, 1.16, 1.16, 1.16, 1.04, 1.04, 1.04, 1.2, 1.2, 1.2, 1, 1, 1]))
    attackTracks.push(vectorTrack(spec.glow, 'scale', [0, .16, .36, .72], [1, 1, 1, .82, .82, .82, 1.85, 1.85, 1.85, 1, 1, 1]))
  }
  return [new THREE.AnimationClip('idle', 2, idleTracks), new THREE.AnimationClip('attack', .72, attackTracks)]
}

const bespokeTowers: Record<string, () => THREE.Group> = {
  gemtd_baiyin: whiteSilverTower,
  gemtd_kongqueshi: malachiteTower,
  gemtd_xingcaihongbaoshi: starRubyTower,
}

/** Build the live Three.js scene graph for a recipe tower (no GLB). */
export function createTowerScene(recipe: TowerRecipeInput): THREE.Group {
  const factory = bespokeTowers[recipe.id]
  return factory ? factory() : generatedRecipeTower(recipe)
}

/** Prototype root + shared animation clips for cloning into the game scene. */
export function createTowerPrototype(recipe: TowerRecipeInput) {
  const root = createTowerScene(recipe)
  const clips = createTowerAnimations(root)
  return { root, clips }
}
