import { onMounted, ref, watch, type CSSProperties, type Ref } from 'vue'
import { tryOnScopeDispose, useRafFn, useResizeObserver } from '@vueuse/core'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type * as Y from 'yjs'
import {
  BASE_TOWER_FOOTPRINT_SCALE,
  BASE_TOWER_HEIGHT_STEP,
  BASE_TOWER_MIN_HEIGHT_SCALE,
  GRID_SIZE,
  HALF,
  RECIPE_TOWER_FOOTPRINT,
  RECIPE_TOWER_HEIGHT,
  RESERVED_ZONE_COLOR,
  ROCK_BODY_Y,
  ROCK_DETAIL_PANEL_Y,
  ROCK_HEIGHT_SCALE,
  rockType,
  routePoints,
  towerTypes,
} from '../game/constants'
import { calculateRoute, calculateRouteSegments } from '../game/pathfinding'
import {
  cellKey,
  getAllyBuffAuraRadiusCells,
  getEffectiveTowerRangeCells,
  getTowerStats,
  isReservedBuildCell,
  isPlaceableBuildCell,
  isValidCell,
  parseTower,
  recipeData,
  routePointAt,
  towerData,
  towerDisplayName,
  typeHash,
} from '../game/towers'
import { createTowerPrototype } from '../game/towerModels'
import type {
  BattleMonster,
  BattleProjectile,
  BattleSnapshot,
  Cell,
  PlayerBuildState,
  RoutePoint,
  Tower,
} from '../game/types'

export { towerDisplayName }

export function useGameScene(options: {
  towers: Y.Map<string>
  buildState: Ref<PlayerBuildState>
  battleState: Ref<BattleSnapshot>
  serverClockOffset: Ref<number>
  removing: Ref<boolean>
  swapping: Ref<boolean>
  cheatMode: Ref<boolean>
  topDownView: Ref<boolean>
  selectedTowerKey: Ref<string | undefined>
  selectedMonsterId: Ref<number | undefined>
  hoveredAuraAbilityId: Ref<string | undefined>
  layoutGuideCells: Ref<readonly string[]>
  playerId: Ref<string>
  doc: Y.Doc
  showMessage: (text: string) => void
  placeRandomTower: (cellKey: string) => void
  placeRock: (cellKey: string) => void
  swapTowerCells: (keyA: string, keyB: string) => void
  selectTower: (key: string) => void
  selectMonster: (id: number) => void
  clearSelection: () => void
  clearMonsterSelection: () => void
  /** Close tool/info sheets (layouts, leaderboard, etc.). Return true if any were open. */
  closeInfoPanels?: () => boolean
  syncCombatLayout: () => void
}) {
  const {
    towers,
    buildState,
    battleState,
    serverClockOffset,
    removing,
    swapping,
    cheatMode,
    topDownView,
    selectedTowerKey,
    selectedMonsterId,
    hoveredAuraAbilityId,
    layoutGuideCells,
    playerId,
    showMessage,
    placeRandomTower,
    placeRock,
    swapTowerCells,
    selectTower,
    selectMonster,
    clearSelection,
    clearMonsterSelection,
    closeInfoPanels,
    syncCombatLayout,
  } = options

  const host = ref<HTMLDivElement>()
  const detailPanel = ref<HTMLElement>()
  const monsterDetailPanel = ref<HTMLElement>()
  const towerDetailStyle = ref<CSSProperties>({ left: '50%', top: '50%', transform: 'translateX(-50%)' })
  const monsterDetailStyle = ref<CSSProperties>({ left: '50%', top: '50%', transform: 'translateX(-50%)' })
  const routeLength = ref(0)

  let scene: THREE.Scene
  let camera: THREE.OrthographicCamera
  let renderer: THREE.WebGLRenderer
  let controls: OrbitControls
  let pointerStart: { x: number; y: number } | undefined
  let activePointerIds = new Set<number>()
  let multiTouchGesture = false
  let swapSourceKey: string | undefined
  let initialized = false

  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  const cellGroup = new THREE.Group()
  const towerGroup = new THREE.Group()
  const monsterGroup = new THREE.Group()
  const projectileGroup = new THREE.Group()
  const effectGroup = new THREE.Group()
  const rangeIndicatorGroup = new THREE.Group()
  const layoutGuideGroup = new THREE.Group()
  const cellLookup: Cell[] = []
  let cellMesh: THREE.InstancedMesh | undefined
  let layoutGuideMesh: THREE.InstancedMesh | undefined
  const towerMeshes: THREE.Object3D[] = []
  const towerMixers: THREE.AnimationMixer[] = []
  const towerVisualByKey = new Map<string, THREE.Object3D>()
  const recipePrototypes = new Map<string, {
    root: THREE.Group
    clips: THREE.AnimationClip[]
    fitScale: number
    groundY: number
  }>()
  const seenProjectileIds = new Set<number>()
  const animationClock = new THREE.Clock()
  const recipeFitSize = new THREE.Vector3()
  const recipeFitBox = new THREE.Box3()
  const monsterVisuals = new Map<number, THREE.Group>()
  const monsterMeshes: THREE.Object3D[] = []
  const monsterSelectionRingGeometry = new THREE.RingGeometry(0.42, 0.58, 32)
  const monsterSelectionRingMaterial = new THREE.MeshBasicMaterial({
    color: '#d4a017',
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  const projectileVisuals = new Map<number, THREE.Group>()
  const impactEffects: { mesh: THREE.Mesh; bornAt: number }[] = []

  const cellGeometry = new THREE.BoxGeometry(0.94, 0.1, 0.94)
  const cellMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 })
  const towerGeometry = new THREE.CylinderGeometry(0.68, 0.8, 1.65, 6)
  const recipeHaloGeometry = new THREE.TorusGeometry(0.58, 0.038, 6, 32)
  const monsterBodyGeometry = new THREE.IcosahedronGeometry(.38, 1)
  const monsterBossGeometry = new THREE.DodecahedronGeometry(.62, 1)
  const monsterEyeGeometry = new THREE.SphereGeometry(.055, 8, 6)
  const monsterWingGeometry = new THREE.ConeGeometry(.26, .62, 3)
  const healthBarGeometry = new THREE.PlaneGeometry(1.18, .14)
  const HEALTH_BAR_HALF_WIDTH = 1.18 / 2
  const projectileGeometry = new THREE.SphereGeometry(.09, 10, 8)
  const impactGeometry = new THREE.RingGeometry(.12, .18, 20)
  const healthBackMaterial = new THREE.MeshBasicMaterial({ color: '#2f4638', transparent: true, opacity: .92, depthTest: false, depthWrite: false, fog: false })
  const healthFillMaterial = new THREE.MeshBasicMaterial({ color: '#65e58e', depthTest: false, depthWrite: false, fog: false })
  const healthLowColor = new THREE.Color('#ff6b57')
  const healthHighColor = new THREE.Color('#65e58e')
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: '#fff7cf' })
  const projectileMaterials = new Map<string, THREE.MeshBasicMaterial>()
  const candidateGlowGeometry = new THREE.CylinderGeometry(0.88, 0.88, 0.035, 6)
  const candidateGlowMaterial = new THREE.MeshBasicMaterial({ color: '#ffe16e', transparent: true, opacity: 0.68, depthWrite: false })
  const selectionRingGeometry = new THREE.TorusGeometry(0.52, 0.032, 6, 24)
  const selectionRingMaterial = new THREE.MeshBasicMaterial({ color: '#d7fff0', transparent: true, opacity: 0.95, depthTest: false })
  const rangeFillMaterial = new THREE.MeshBasicMaterial({ color: '#6e9a7b', transparent: true, opacity: 0.14, depthWrite: false })
  const rangeEdgeMaterial = new THREE.LineBasicMaterial({ color: '#4f8168', transparent: true, opacity: 0.72, depthTest: false })
  const auraRangeFillMaterial = new THREE.MeshBasicMaterial({ color: '#d4b45a', transparent: true, opacity: 0.18, depthWrite: false })
  const auraRangeEdgeMaterial = new THREE.LineBasicMaterial({ color: '#c49a2e', transparent: true, opacity: 0.85, depthTest: false })
  const layoutGuideGeometry = new THREE.BoxGeometry(0.88, 0.08, 0.88)
  const layoutGuideMaterial = new THREE.MeshBasicMaterial({
    color: '#e8b41a',
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    depthTest: false,
  })
  let rangeFillMesh: THREE.Mesh | undefined
  let rangeEdgeLine: THREE.LineLoop | undefined
  const auraPulseMaterials: THREE.MeshStandardMaterial[] = []
  const towerMaterials = new Map<string, THREE.MeshStandardMaterial>()
  const specialMaterials = new Map<string, THREE.MeshStandardMaterial>()
  const ghostMaterial = new THREE.MeshStandardMaterial({ color: '#4f8b66', transparent: true, opacity: 0.34, depthWrite: false })
  const ghost = new THREE.Mesh(towerGeometry, ghostMaterial)
  const ghostOutline = new THREE.LineSegments(
    new THREE.EdgesGeometry(towerGeometry),
    new THREE.LineBasicMaterial({ color: '#f7fff3', transparent: true, opacity: 0.9, depthTest: false }),
  )
  const pathMaterials = [
    '#58b888', '#4eb8c7', '#5a9fd4', '#8f7ec8', '#c985b8', '#d9786a',
  ].map((color) => new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.88, depthTest: false }))
  const pathLines: THREE.Line[] = []
  const ROUTE_SEGMENT_BASE_Y = 0.13
  const ROUTE_SEGMENT_Y_STEP = 0.035

  ghost.add(ghostOutline)
  ghost.scale.set(BASE_TOWER_FOOTPRINT_SCALE, BASE_TOWER_MIN_HEIGHT_SCALE, BASE_TOWER_FOOTPRINT_SCALE)
  ghost.visible = false

  function position(cell: Cell) {
    return new THREE.Vector3(cell.x - HALF, 0, cell.z - HALF)
  }

  function baseTowerHeight(quality = 1) {
    return BASE_TOWER_MIN_HEIGHT_SCALE + Math.max(0, Math.min(5, quality - 1)) * BASE_TOWER_HEIGHT_STEP
  }

  function setGhostTowerScale(quality = 1) {
    const height = baseTowerHeight(quality)
    ghost.scale.set(BASE_TOWER_FOOTPRINT_SCALE, height, BASE_TOWER_FOOTPRINT_SCALE)
    return height
  }

  function materialFor(tower: Tower) {
    const existing = towerMaterials.get(tower.type) || specialMaterials.get(tower.type)
    if (existing) return existing
    const hash = typeHash(tower.type)
    const color = new THREE.Color().setHSL((hash % 360) / 360, 0.68, 0.56)
    const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.16, roughness: 0.3, metalness: 0.28 })
    specialMaterials.set(tower.type, material)
    return material
  }

  function clearRangeIndicator() {
    if (rangeFillMesh) {
      rangeIndicatorGroup.remove(rangeFillMesh)
      rangeFillMesh.geometry.dispose()
      rangeFillMesh = undefined
    }
    if (rangeEdgeLine) {
      rangeIndicatorGroup.remove(rangeEdgeLine)
      rangeEdgeLine.geometry.dispose()
      rangeEdgeLine = undefined
    }
  }

  function syncRangeIndicator() {
    clearRangeIndicator()
    if (!selectedTowerKey.value) return

    const hoverAbilityId = hoveredAuraAbilityId.value
    let range: number | undefined
    let fillMaterial = rangeFillMaterial
    let edgeMaterial = rangeEdgeMaterial

    if (hoverAbilityId) {
      const stats = getTowerStats(parseTower(towers.get(selectedTowerKey.value)))
      range = stats ? getAllyBuffAuraRadiusCells(hoverAbilityId, stats.range) : undefined
      fillMaterial = auraRangeFillMaterial
      edgeMaterial = auraRangeEdgeMaterial
    } else {
      range = getEffectiveTowerRangeCells(towers, selectedTowerKey.value)
    }
    if (!range) return

    const [x, z] = selectedTowerKey.value.split(':').map(Number)
    rangeIndicatorGroup.position.copy(position({ x, z }))
    rangeIndicatorGroup.position.y = 0.04

    rangeFillMesh = new THREE.Mesh(new THREE.CircleGeometry(range, 64), fillMaterial)
    rangeFillMesh.rotation.x = -Math.PI / 2
    rangeFillMesh.renderOrder = 2
    rangeIndicatorGroup.add(rangeFillMesh)

    const edgePoints: THREE.Vector3[] = []
    for (let index = 0; index <= 64; index++) {
      const angle = (index / 64) * Math.PI * 2
      edgePoints.push(new THREE.Vector3(Math.cos(angle) * range, 0, Math.sin(angle) * range))
    }
    rangeEdgeLine = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(edgePoints), edgeMaterial)
    rangeEdgeLine.renderOrder = 3
    rangeIndicatorGroup.add(rangeEdgeLine)
  }

  function collectAuraAffectedKeys(sourceKey: string, abilityId: string) {
    const affected = new Set<string>()
    const stats = getTowerStats(parseTower(towers.get(sourceKey)))
    const radius = stats ? getAllyBuffAuraRadiusCells(abilityId, stats.range) : undefined
    if (radius === undefined) return affected

    const [sourceX, sourceZ] = sourceKey.split(':').map(Number)
    towers.forEach((_raw, key) => {
      const [x, z] = key.split(':').map(Number)
      if (!isValidCell({ x, z })) return
      if (Math.hypot(x - sourceX, z - sourceZ) <= radius) affected.add(key)
    })
    return affected
  }

  function clearPathLines() {
    for (const line of pathLines) {
      cellGroup.remove(line)
      line.geometry.dispose()
    }
    pathLines.length = 0
  }

  function refreshRoute() {
    const segments = calculateRouteSegments(towers)
    routeLength.value = segments ? segments.reduce((sum, segment) => sum + segment.length - 1, 0) : 0
    clearPathLines()
    if (!segments) return

    segments.forEach((segment, index) => {
      const y = ROUTE_SEGMENT_BASE_Y + index * ROUTE_SEGMENT_Y_STEP
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(segment.map((cell) => position(cell).setY(y))),
        pathMaterials[index],
      )
      line.renderOrder = 4 + index * 0.01
      cellGroup.add(line)
      pathLines.push(line)
    })
  }

  function handleTowersChanged(event: Y.YMapEvent<string>) {
    for (const [changedKey, change] of event.changes.keys) {
      if (change.action !== 'add' && change.action !== 'update') continue
      const [x, z] = changedKey.split(':').map(Number)
      if (isValidCell({ x, z }) && isReservedBuildCell({ x, z })) {
        towers.delete(changedKey)
        showMessage('起点/终点角落区域不能建造')
        return
      }
    }

    if (!calculateRoute(towers)) {
      const addedKeys = [...event.changes.keys]
        .filter(([changedKey, change]) => change.action === 'add' && towers.has(changedKey))
        .map(([changedKey]) => changedKey)
        .sort()
      const rejectedKey = addedKeys[addedKeys.length - 1]
      if (rejectedKey) {
        towers.delete(rejectedKey)
        showMessage('协作放置已撤销：合并后会阻断怪物路线')
        return
      }
    }
    if (selectedTowerKey.value && !towers.has(selectedTowerKey.value)) clearSelection()
    rebuildTowers()
    refreshRoute()
    syncCombatLayout()
  }

  function createMarkerLabel(point: RoutePoint) {
    const label = document.createElement('canvas')
    label.width = 256
    label.height = 128
    const context = label.getContext('2d')!
    context.font = '700 48px sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillStyle = point.kind === 'start' ? '#27664d' : point.kind === 'end' ? '#a54845' : '#8a6a25'
    context.fillText(point.kind === 'waypoint' ? `P${point.label}` : point.label, 128, 64)
    const texture = new THREE.CanvasTexture(label)
    texture.colorSpace = THREE.SRGBColorSpace
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }))
    sprite.position.copy(position(point))
    sprite.position.y = 1.05
    sprite.scale.set(2.2, 1.1, 1)
    sprite.renderOrder = 5
    return sprite
  }

  function clearLayoutGuide() {
    if (!layoutGuideMesh) return
    layoutGuideGroup.remove(layoutGuideMesh)
    layoutGuideMesh.dispose()
    layoutGuideMesh = undefined
  }

  function syncLayoutGuide() {
    clearLayoutGuide()
    const cells = layoutGuideCells.value
      .map((key) => {
        const [xText, zText] = key.split(':')
        const x = Number(xText)
        const z = Number(zText)
        return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : undefined
      })
      .filter((cell): cell is Cell => Boolean(cell) && isValidCell(cell!) && !routePointAt(cell!) && !isReservedBuildCell(cell!))
    if (!cells.length) return

    const mesh = new THREE.InstancedMesh(layoutGuideGeometry, layoutGuideMaterial, cells.length)
    const transform = new THREE.Matrix4()
    cells.forEach((cell, index) => {
      const point = position(cell)
      transform.makeTranslation(point.x, 0.08, point.z)
      mesh.setMatrixAt(index, transform)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.renderOrder = 3
    mesh.frustumCulled = false
    disableRaycast(mesh)
    layoutGuideMesh = mesh
    layoutGuideGroup.add(mesh)
  }

  function createMap() {
    const mesh = new THREE.InstancedMesh(cellGeometry, cellMaterial, GRID_SIZE * GRID_SIZE)
    const transform = new THREE.Matrix4()
    let instance = 0
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        const cellData = { x, z }
        const marker = routePointAt(cellData)
        const color = isReservedBuildCell(cellData)
          ? RESERVED_ZONE_COLOR
          : marker?.kind === 'start'
            ? '#75c89b'
            : marker?.kind === 'end'
              ? '#d97970'
              : marker
                ? '#e1c46f'
                : '#cdd8cb'
        const cellPosition = position(cellData)
        cellPosition.y = -0.04
        transform.makeTranslation(cellPosition.x, cellPosition.y, cellPosition.z)
        mesh.setMatrixAt(instance, transform)
        mesh.setColorAt(instance, new THREE.Color(color))
        cellLookup[instance] = cellData
        instance++
      }
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    cellMesh = mesh
    cellGroup.add(mesh)
    routePoints.forEach((point) => cellGroup.add(createMarkerLabel(point)))
    refreshRoute()
  }

  function disableRaycast(object: THREE.Object3D) {
    object.raycast = () => {}
  }

  function addModelOutline(mesh: THREE.Mesh, color: string, opacity: number) {
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
    )
    outline.renderOrder = 2
    disableRaycast(outline)
    mesh.add(outline)
  }

  function getRecipePrototype(type: string) {
    const cached = recipePrototypes.get(type)
    if (cached) return cached
    const recipe = recipeData.get(type)
    if (!recipe) return undefined
    const prototype = createTowerPrototype({ id: recipe.id, name: recipe.name, tier: recipe.tier })
    prototype.root.updateMatrixWorld(true)
    recipeFitBox.setFromObject(prototype.root)
    recipeFitBox.getSize(recipeFitSize)
    const footprint = Math.max(recipeFitSize.x, recipeFitSize.z, 0.001)
    const height = Math.max(recipeFitSize.y, 0.001)
    const fitScale = Math.min(RECIPE_TOWER_FOOTPRINT / footprint, RECIPE_TOWER_HEIGHT / height)
    const entry = {
      root: prototype.root,
      clips: prototype.clips,
      fitScale,
      groundY: -recipeFitBox.min.y * fitScale,
    }
    recipePrototypes.set(type, entry)
    return entry
  }

  function warmRecipePrototypes() {
    for (const recipe of towerData.recipes) getRecipePrototype(recipe.id)
  }

  function playTowerAttack(visual: THREE.Object3D) {
    const mixer = visual.userData.mixer as THREE.AnimationMixer | undefined
    const idleAction = visual.userData.idleAction as THREE.AnimationAction | undefined
    const attackClip = visual.userData.attackClip as THREE.AnimationClip | undefined
    if (!mixer || !attackClip) return
    const attackAction = mixer.clipAction(attackClip)
    idleAction?.stop()
    attackAction.reset()
    attackAction.setLoop(THREE.LoopOnce, 1)
    attackAction.clampWhenFinished = true
    attackAction.play()
    const onFinished = (event: { action: THREE.AnimationAction }) => {
      if (event.action !== attackAction) return
      mixer.removeEventListener('finished', onFinished)
      idleAction?.reset().play()
    }
    mixer.addEventListener('finished', onFinished)
  }

  function createRecipeTower(tower: Tower) {
    const prototype = getRecipePrototype(tower.type)
    if (!prototype) {
      const fallback = new THREE.Group()
      const body = new THREE.Mesh(towerGeometry, materialFor(tower))
      body.position.y = .8 * BASE_TOWER_MIN_HEIGHT_SCALE
      body.scale.set(BASE_TOWER_FOOTPRINT_SCALE, BASE_TOWER_MIN_HEIGHT_SCALE, BASE_TOWER_FOOTPRINT_SCALE)
      addModelOutline(body, '#17231c', .35)
      fallback.add(body)
      return fallback
    }

    const holder = new THREE.Group()
    const model = prototype.root.clone(true)
    model.scale.setScalar(prototype.fitScale)
    model.position.y = prototype.groundY
    model.traverse((item) => {
      if (item instanceof THREE.Mesh) {
        item.castShadow = true
        item.receiveShadow = true
      }
      // Point lights baked into the procedural models are too bright on a crowded board.
      if (item instanceof THREE.Light) item.intensity *= .22
    })
    holder.add(model)

    const mixer = new THREE.AnimationMixer(model)
    const idleClip = prototype.clips.find((clip) => clip.name === 'idle')
    const attackClip = prototype.clips.find((clip) => clip.name === 'attack')
    const idleAction = idleClip ? mixer.clipAction(idleClip) : undefined
    idleAction?.play()
    holder.userData.mixer = mixer
    holder.userData.idleAction = idleAction
    holder.userData.attackClip = attackClip
    towerMixers.push(mixer)
    return holder
  }

  function createTowerModel(tower: Tower) {
    if (recipeData.has(tower.type)) return createRecipeTower(tower)
    const group = new THREE.Group()
    const body = new THREE.Mesh(towerGeometry, materialFor(tower))
    const heightScale = baseTowerHeight(tower.quality)
    body.position.y = tower.type === 'rock' ? ROCK_BODY_Y : .8 * heightScale
    if (tower.type === 'rock') body.scale.set(BASE_TOWER_FOOTPRINT_SCALE, ROCK_HEIGHT_SCALE, BASE_TOWER_FOOTPRINT_SCALE)
    else body.scale.set(BASE_TOWER_FOOTPRINT_SCALE, heightScale, BASE_TOWER_FOOTPRINT_SCALE)
    addModelOutline(body, tower.temporary ? '#fff3aa' : '#17231c', tower.temporary ? .95 : .35)
    group.add(body)
    return group
  }

  function clearAuraPulseMaterials() {
    for (const material of auraPulseMaterials) material.dispose()
    auraPulseMaterials.length = 0
  }

  function enableAuraPulse(root: THREE.Object3D) {
    const shared = new Map<THREE.MeshStandardMaterial, THREE.MeshStandardMaterial>()
    root.traverse((item) => {
      if (!(item instanceof THREE.Mesh)) return
      const material = item.material
      if (!(material instanceof THREE.MeshStandardMaterial)) return
      let cloned = shared.get(material)
      if (!cloned) {
        cloned = material.clone()
        cloned.userData.baseEmissiveIntensity = material.emissiveIntensity
        if (cloned.emissive.getHex() === 0) cloned.emissive.copy(cloned.color)
        shared.set(material, cloned)
        auraPulseMaterials.push(cloned)
      }
      item.material = cloned
    })
  }

  function rebuildTowers() {
    if (!towerMaterials.size) return
    clearAuraPulseMaterials()
    while (towerGroup.children.length) {
      const object = towerGroup.remove(towerGroup.children[0])
      object.traverse((item) => {
        if (item instanceof THREE.LineSegments) {
          item.geometry.dispose()
          ;(item.material as THREE.Material).dispose()
        }
      })
    }
    towerMeshes.length = 0
    towerMixers.length = 0
    towerVisualByKey.clear()

    const auraAffectedKeys =
      selectedTowerKey.value && hoveredAuraAbilityId.value
        ? collectAuraAffectedKeys(selectedTowerKey.value, hoveredAuraAbilityId.value)
        : undefined

    towers.forEach((raw, rawKey) => {
      const [x, z] = rawKey.split(':').map(Number)
      const tower = parseTower(raw)
      if (!tower || !isValidCell({ x, z }) || routePointAt({ x, z }) || isReservedBuildCell({ x, z })) return
      const mesh = createTowerModel(tower)
      mesh.position.copy(position({ x, z }))
      mesh.userData = { ...mesh.userData, x, z, tower: true }
      if (tower.temporary) {
        const glow = new THREE.Mesh(candidateGlowGeometry, candidateGlowMaterial)
        glow.position.y = .02
        disableRaycast(glow)
        mesh.add(glow)
      }
      if (auraAffectedKeys?.has(rawKey)) enableAuraPulse(mesh)
      if (selectedTowerKey.value === rawKey) {
        const ring = new THREE.Mesh(selectionRingGeometry, selectionRingMaterial)
        ring.rotation.x = -Math.PI / 2
        ring.position.y = .03
        ring.renderOrder = 4
        disableRaycast(ring)
        mesh.add(ring)
      }
      towerGroup.add(mesh)
      towerMeshes.push(mesh)
      towerVisualByKey.set(rawKey, mesh)
    })
    syncRangeIndicator()
  }

  function updateHealthBarVisual(visual: THREE.Object3D, hp: number, maxHp: number) {
    const fill = visual.userData.healthFill as THREE.Mesh
    if (!fill) return
    const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0
    fill.scale.set(Math.max(ratio, 0.001), 1, 1)
    fill.position.x = -(1 - ratio) * HEALTH_BAR_HALF_WIDTH
    const material = fill.material as THREE.MeshBasicMaterial
    material.color.copy(healthHighColor).lerp(healthLowColor, 1 - ratio)
  }

  function createMonsterVisual(monster: BattleMonster) {
    const root = new THREE.Group()
    const hue = ((monster.id * 47 + battleState.value.wave * 19) % 360) / 360
    const color = new THREE.Color().setHSL(hue, .58, monster.boss ? .42 : .5)
    const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .12, roughness: .68 })
    const body = new THREE.Mesh(monster.boss ? monsterBossGeometry : monsterBodyGeometry, material)
    body.position.y = monster.flying ? .82 : .46
    body.scale.set(monster.boss ? 1.12 : 1, monster.flying ? .72 : 1.08, monster.boss ? 1.12 : 1)
    body.castShadow = true
    root.add(body)

    const eyeY = body.position.y + (monster.boss ? .12 : .07)
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(monsterEyeGeometry, eyeMaterial)
      eye.position.set(side * (monster.boss ? .19 : .13), eyeY, .34)
      root.add(eye)
    }
    if (monster.flying) {
      for (const side of [-1, 1]) {
        const wing = new THREE.Mesh(monsterWingGeometry, material)
        wing.position.set(side * .48, .78, 0)
        wing.rotation.z = side * -Math.PI / 2
        root.add(wing)
      }
    }

    const healthBar = new THREE.Group()
    healthBar.position.y = monster.boss ? 1.62 : 1.27
    const back = new THREE.Mesh(healthBarGeometry, healthBackMaterial.clone())
    const fill = new THREE.Mesh(healthBarGeometry, healthFillMaterial.clone())
    fill.position.z = 0.02
    back.renderOrder = 10
    fill.renderOrder = 11
    fill.frustumCulled = false
    disableRaycast(back)
    disableRaycast(fill)
    healthBar.add(back, fill)
    root.add(healthBar)

    const selectionRing = new THREE.Mesh(monsterSelectionRingGeometry, monsterSelectionRingMaterial)
    selectionRing.rotation.x = -Math.PI / 2
    selectionRing.position.y = 0.05
    selectionRing.visible = false
    selectionRing.renderOrder = 5
    disableRaycast(selectionRing)
    root.add(selectionRing)

    root.userData = {
      monsterId: monster.id,
      targetX: monster.x - HALF,
      targetZ: monster.z - HALF,
      healthFill: fill,
      healthBar,
      body,
      bodyMaterial: material,
      selectionRing,
      projectile: undefined,
    }
    root.position.set(monster.x - HALF, 0, monster.z - HALF)
    applyMonsterStatusVisual(root, monster)
    monsterGroup.add(root)
    monsterMeshes.push(root)
    updateHealthBarVisual(root, monster.hp, monster.maxHp)
    return root
  }

  function applyMonsterStatusVisual(visual: THREE.Object3D, monster: BattleMonster) {
    const material = visual.userData.bodyMaterial as THREE.MeshStandardMaterial
    if (!material) return
    const cloaked = Boolean(monster.cloaked)
    material.transparent = cloaked || Boolean(monster.physicalImmune) || Boolean(monster.magicImmune)
    material.opacity = cloaked ? 0.28 : 1
    material.depthWrite = !cloaked
    if (monster.physicalImmune) material.emissive.set('#6ec8ff')
    else if (monster.magicImmune) material.emissive.set('#d28cff')
    else material.emissive.copy(material.color)
    material.emissiveIntensity = monster.physicalImmune || monster.magicImmune ? 0.35 : 0.12
    const healthBar = visual.userData.healthBar as THREE.Group | undefined
    if (healthBar) healthBar.visible = !cloaked
  }

  function createProjectileVisual(projectile: BattleProjectile) {
    let material = projectileMaterials.get(projectile.color)
    if (!material) {
      const color = new THREE.Color(projectile.color)
      material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .95 })
      projectileMaterials.set(projectile.color, material)
    }
    const root = new THREE.Group()
    const orb = new THREE.Mesh(projectileGeometry, material)
    const halo = new THREE.Mesh(recipeHaloGeometry, material)
    halo.scale.setScalar(.26)
    halo.rotation.x = Math.PI / 2
    root.add(orb, halo)
    root.userData.projectile = projectile
    projectileGroup.add(root)
    return root
  }

  function spawnImpact(impactPosition: THREE.Vector3, color: string) {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .9, side: THREE.DoubleSide, depthWrite: false })
    const mesh = new THREE.Mesh(impactGeometry, material)
    mesh.position.copy(impactPosition)
    mesh.position.y = Math.max(.12, mesh.position.y)
    mesh.rotation.x = -Math.PI / 2
    effectGroup.add(mesh)
    impactEffects.push({ mesh, bornAt: performance.now() })
  }

  function syncBattleVisuals(snapshot: BattleSnapshot) {
    if (!initialized) return
    const activeMonsters = new Set(snapshot.monsters.map((monster) => monster.id))
    snapshot.monsters.forEach((monster) => {
      const visual = monsterVisuals.get(monster.id) || createMonsterVisual(monster)
      monsterVisuals.set(monster.id, visual)
      visual.userData.targetX = monster.x - HALF
      visual.userData.targetZ = monster.z - HALF
      visual.userData.monsterId = monster.id
      const selectionRing = visual.userData.selectionRing as THREE.Mesh | undefined
      if (selectionRing) selectionRing.visible = selectedMonsterId.value === monster.id
      applyMonsterStatusVisual(visual, monster)
      updateHealthBarVisual(visual, monster.hp, monster.maxHp)
    })
    monsterVisuals.forEach((visual, id) => {
      if (activeMonsters.has(id)) return
      spawnImpact(visual.position.clone().setY(.45), '#ffd875')
      ;(visual.userData.bodyMaterial as THREE.Material)?.dispose()
      const healthFill = visual.userData.healthFill as THREE.Mesh
      const healthBar = visual.userData.healthBar as THREE.Group
      ;((healthBar.children[0] as THREE.Mesh).material as THREE.Material)?.dispose()
      ;(healthFill.material as THREE.Material)?.dispose()
      const meshIndex = monsterMeshes.indexOf(visual)
      if (meshIndex >= 0) monsterMeshes.splice(meshIndex, 1)
      monsterGroup.remove(visual)
      monsterVisuals.delete(id)
    })
    if (selectedMonsterId.value != null && !activeMonsters.has(selectedMonsterId.value)) {
      clearMonsterSelection()
    }

    const activeProjectiles = new Set(snapshot.projectiles.map((projectile) => projectile.id))
    snapshot.projectiles.forEach((projectile) => {
      const existing = projectileVisuals.get(projectile.id)
      if (!existing && !seenProjectileIds.has(projectile.id)) {
        seenProjectileIds.add(projectile.id)
        const towerVisual = towerVisualByKey.get(projectile.towerKey)
        if (towerVisual) playTowerAttack(towerVisual)
      }
      const visual = existing || createProjectileVisual(projectile)
      visual.userData.projectile = projectile
      projectileVisuals.set(projectile.id, visual)
    })
    projectileVisuals.forEach((visual, id) => {
      if (activeProjectiles.has(id)) return
      spawnImpact(
        visual.position,
        (visual.children[0] as THREE.Mesh).material instanceof THREE.MeshBasicMaterial
          ? ((visual.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).color.getStyle()
          : '#fff3a5',
      )
      projectileGroup.remove(visual)
      projectileVisuals.delete(id)
      seenProjectileIds.delete(id)
    })
  }

  function updateBattleVisuals() {
    const now = Date.now() + serverClockOffset.value
    const monstersById = new Map(battleState.value.monsters.map((monster) => [monster.id, monster]))
    monsterVisuals.forEach((visual, id) => {
      visual.position.x += (visual.userData.targetX - visual.position.x) * .22
      visual.position.z += (visual.userData.targetZ - visual.position.z) * .22
      const monster = monstersById.get(id)
      if (monster) updateHealthBarVisual(visual, monster.hp, monster.maxHp)
      const body = visual.userData.body as THREE.Mesh
      body.rotation.y += .018
      body.position.y += (Math.sin(performance.now() * .006 + visual.id) * .025 - (body.position.y - (body.position.y > .65 ? .82 : .46))) * .08
      ;(visual.userData.healthBar as THREE.Group).quaternion.copy(camera.quaternion)
    })
    projectileVisuals.forEach((visual) => {
      const projectile = visual.userData.projectile as BattleProjectile
      const duration = Math.max(1, projectile.impactAt - projectile.launchAt)
      const progress = Math.max(0, Math.min(1, (now - projectile.launchAt) / duration))
      const target = monsterVisuals.get(projectile.targetId)
      const targetX = target?.position.x ?? visual.position.x
      const targetZ = target?.position.z ?? visual.position.z
      visual.position.set(
        THREE.MathUtils.lerp(projectile.fromX - HALF, targetX, progress),
        THREE.MathUtils.lerp(1.18, .52, progress) + Math.sin(progress * Math.PI) * .9,
        THREE.MathUtils.lerp(projectile.fromZ - HALF, targetZ, progress),
      )
      visual.rotation.y += .14
    })
    for (let index = impactEffects.length - 1; index >= 0; index--) {
      const effect = impactEffects[index]
      const age = (performance.now() - effect.bornAt) / 420
      if (age >= 1) {
        effectGroup.remove(effect.mesh)
        ;(effect.mesh.material as THREE.Material).dispose()
        impactEffects.splice(index, 1)
        continue
      }
      effect.mesh.scale.setScalar(1 + age * 3.4)
      ;(effect.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - age
    }
  }

  function resize() {
    if (!host.value || !renderer) return
    const { width, height } = host.value.getBoundingClientRect()
    if (!width || !height) return
    const view = 25
    const aspect = width / height
    camera.left = -view * aspect
    camera.right = view * aspect
    camera.top = view
    camera.bottom = -view
    camera.updateProjectionMatrix()
    renderer.setSize(width, height, false)
  }

  function isCompactUi() {
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches
  }

  function isCoarsePointer() {
    return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  }

  function clickDragThreshold() {
    return isCoarsePointer() ? 16 : 12
  }

  function clearAnchoredDetailStyle(style: typeof towerDetailStyle) {
    if (Object.keys(style.value).length) style.value = {}
  }

  function updateTowerDetailPosition() {
    if (!selectedTowerKey.value || !host.value || !renderer || !camera) return
    if (isCompactUi()) {
      clearAnchoredDetailStyle(towerDetailStyle)
      return
    }
    const [x, z] = selectedTowerKey.value.split(':').map(Number)
    const tower = parseTower(towers.get(selectedTowerKey.value))
    if (!tower || !isValidCell({ x, z })) return

    const point = position({ x, z })
    point.y = tower.type === 'rock' ? ROCK_DETAIL_PANEL_Y : 1.9
    point.project(camera)
    const { width, height } = host.value.getBoundingClientRect()
    const panelWidth = Math.min(306, Math.max(0, width - 24))
    const panelHeight = detailPanel.value?.offsetHeight || 180
    const projectedX = (point.x * .5 + .5) * width
    const projectedY = (-point.y * .5 + .5) * height
    const left = Math.max(12 + panelWidth / 2, Math.min(width - 12 - panelWidth / 2, projectedX))
    const top = Math.max(12, Math.min(height - panelHeight - 12, projectedY + 30))
    const next = { left: `${left}px`, top: `${top}px`, transform: 'translateX(-50%)' }
    if (towerDetailStyle.value.left !== next.left || towerDetailStyle.value.top !== next.top) towerDetailStyle.value = next
  }

  function updateMonsterDetailPosition() {
    if (selectedMonsterId.value == null || !host.value || !renderer || !camera) return
    if (isCompactUi()) {
      clearAnchoredDetailStyle(monsterDetailStyle)
      return
    }
    const visual = monsterVisuals.get(selectedMonsterId.value)
    if (!visual) return
    const point = visual.position.clone()
    point.y = 1.45
    point.project(camera)
    const { width, height } = host.value.getBoundingClientRect()
    const panelWidth = Math.min(320, Math.max(0, width - 24))
    const panelHeight = monsterDetailPanel.value?.offsetHeight || 220
    const projectedX = (point.x * .5 + .5) * width
    const projectedY = (-point.y * .5 + .5) * height
    const left = Math.max(12 + panelWidth / 2, Math.min(width - 12 - panelWidth / 2, projectedX))
    const top = Math.max(12, Math.min(height - panelHeight - 12, projectedY + 28))
    const next = { left: `${left}px`, top: `${top}px`, transform: 'translateX(-50%)' }
    if (monsterDetailStyle.value.left !== next.left || monsterDetailStyle.value.top !== next.top) {
      monsterDetailStyle.value = next
    }
  }

  function renderFrame() {
    if (!initialized) return
    controls.update()
    const delta = animationClock.getDelta()
    for (const mixer of towerMixers) mixer.update(delta)
    if (auraPulseMaterials.length) {
      const pulse = (Math.sin(performance.now() * 0.009) * 0.5 + 0.5)
      for (const material of auraPulseMaterials) {
        const base = material.userData.baseEmissiveIntensity as number
        material.emissiveIntensity = base + 0.12 + pulse * 0.72
      }
    }
    updateBattleVisuals()
    updateTowerDetailPosition()
    updateMonsterDetailPosition()
    renderer.render(scene, camera)
  }

  function setRay(event: PointerEvent) {
    const rect = renderer.domElement.getBoundingClientRect()
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1)
    raycaster.setFromCamera(pointer, camera)
  }

  function hit(event: PointerEvent) {
    setRay(event)
    if (monsterMeshes.length) {
      const monsterHit = raycaster.intersectObjects(monsterMeshes, true)[0]
      if (monsterHit) {
        let target: THREE.Object3D | null = monsterHit.object
        while (target && target.userData.monsterId == null) target = target.parent
        if (target && typeof target.userData.monsterId === 'number') {
          return { monsterId: target.userData.monsterId as number }
        }
      }
    }
    const towerHit = raycaster.intersectObjects(towerMeshes, true)[0]
    if (towerHit) {
      let target: THREE.Object3D | null = towerHit.object
      while (target && !target.userData.tower) target = target.parent
      if (target) return target.userData as Cell & { tower: true }
    }
    if (!cellMesh) return
    const cellHit = raycaster.intersectObject(cellMesh, false)[0]
    return cellHit?.instanceId === undefined ? undefined : cellLookup[cellHit.instanceId]
  }

  function beginPointer(event: PointerEvent) {
    if (!isSceneCanvasEvent(event)) return
    if (event.button !== 0 && event.pointerType !== 'touch') return
    activePointerIds.add(event.pointerId)
    if (activePointerIds.size > 1) {
      multiTouchGesture = true
      pointerStart = undefined
      return
    }
    multiTouchGesture = false
    pointerStart = { x: event.clientX, y: event.clientY }
  }

  function endPointer(event: PointerEvent) {
    activePointerIds.delete(event.pointerId)
    if (activePointerIds.size === 0) {
      const wasMultiTouch = multiTouchGesture
      multiTouchGesture = false
      pointerStart = undefined
      return wasMultiTouch
    }
    multiTouchGesture = true
    pointerStart = undefined
    return true
  }

  function isSceneCanvasEvent(event: Event) {
    return Boolean(renderer && event.target === renderer.domElement)
  }

  function updateGhost(event: PointerEvent) {
    if (!renderer) return
    if (!isSceneCanvasEvent(event)) { ghost.visible = false; return }
    if (event.buttons & 2) { ghost.visible = false; return }
    const cell = hit(event)
    if (!cell || 'monsterId' in cell) { ghost.visible = false; return }
    if (removing.value) {
      if (!('tower' in cell)) { ghost.visible = false; return }
      const target = parseTower(towers.get(cellKey(cell)))
      const height = target?.type === 'rock' ? ROCK_HEIGHT_SCALE : setGhostTowerScale(target?.quality)
      if (target?.type === 'rock') ghost.scale.set(BASE_TOWER_FOOTPRINT_SCALE, ROCK_HEIGHT_SCALE, BASE_TOWER_FOOTPRINT_SCALE)
      ghostMaterial.color.set('#ffe083')
      ghostMaterial.opacity = 0.06
      ;(ghostOutline.material as THREE.LineBasicMaterial).color.set('#ffe083')
      ghost.position.copy(position(cell))
      ghost.position.y = .8 * height
      ghost.visible = true
      return
    }
    if (swapping.value) {
      if (!('tower' in cell)) { ghost.visible = false; return }
      const target = parseTower(towers.get(cellKey(cell)))
      if (target?.temporary) { ghost.visible = false; return }
      const key = cellKey(cell)
      const isSource = swapSourceKey === key
      const height = target?.type === 'rock' ? ROCK_HEIGHT_SCALE : setGhostTowerScale(target?.quality)
      if (target?.type === 'rock') ghost.scale.set(BASE_TOWER_FOOTPRINT_SCALE, ROCK_HEIGHT_SCALE, BASE_TOWER_FOOTPRINT_SCALE)
      ghostMaterial.color.set(isSource ? '#b8f5d8' : '#7ec8ff')
      ghostMaterial.opacity = isSource ? 0.12 : 0.08
      ;(ghostOutline.material as THREE.LineBasicMaterial).color.set(isSource ? '#e8fff4' : '#d0f0ff')
      ghost.position.copy(position(cell))
      ghost.position.y = .8 * height
      ghost.visible = true
      return
    }
    if (buildState.value.phase === 'choosing') {
      if (!('tower' in cell)) { ghost.visible = false; return }
      const candidate = parseTower(towers.get(cellKey(cell)))
      if (!candidate?.temporary || candidate.ownerId !== playerId.value) { ghost.visible = false; return }
      const definition = towerTypes.find((tower) => tower.id === candidate.type)
      ghostMaterial.color.set(definition?.color || '#f4dc8d')
      ghostMaterial.opacity = 0.09
      ;(ghostOutline.material as THREE.LineBasicMaterial).color.set('#fff0a6')
      const height = setGhostTowerScale(candidate.quality)
      ghost.position.copy(position(cell))
      ghost.position.y = .8 * height
      ghost.visible = true
      return
    }
    if (buildState.value.phase === 'placing') {
      if (buildState.value.pendingKeys.length >= 5) { ghost.visible = false; return }
      if (!isPlaceableBuildCell(cell, towers)) { ghost.visible = false; return }
      const key = cellKey(cell)
      const existing = parseTower(towers.get(key))
      const routeIsValid = existing?.type === 'rock'
        ? calculateRoute(towers) !== null
        : calculateRoute(towers, cell) !== null
      ghostMaterial.color.set(routeIsValid ? '#f4f0d0' : '#cf4c47')
      ghostMaterial.opacity = routeIsValid ? 0.34 : 0.2
      ;(ghostOutline.material as THREE.LineBasicMaterial).color.set(routeIsValid ? '#f7fff3' : '#ff8c82')
      const height = setGhostTowerScale()
      ghost.position.copy(position(cell))
      ghost.position.y = .8 * height
      ghost.visible = true
      return
    }
    if (cheatMode.value && battleState.value.phase !== 'combat') {
      if (towers.has(cellKey(cell)) || routePointAt(cell) || isReservedBuildCell(cell)) { ghost.visible = false; return }
      const routeIsValid = calculateRoute(towers, cell) !== null
      ghost.scale.set(BASE_TOWER_FOOTPRINT_SCALE, ROCK_HEIGHT_SCALE, BASE_TOWER_FOOTPRINT_SCALE)
      ghostMaterial.color.set(routeIsValid ? '#8a9388' : '#cf4c47')
      ghostMaterial.opacity = routeIsValid ? 0.28 : 0.18
      ;(ghostOutline.material as THREE.LineBasicMaterial).color.set(routeIsValid ? '#d5ddd4' : '#ff8c82')
      ghost.position.copy(position(cell))
      ghost.position.y = .8 * ROCK_HEIGHT_SCALE
      ghost.visible = true
      return
    }
    ghost.visible = false
  }

  /** Clears tower/monster detail panels and tool sheets. Returns true if anything was active. */
  function dismissActiveInfoPanels() {
    const hadSelection = Boolean(selectedTowerKey.value) || selectedMonsterId.value != null
    const closedSheets = closeInfoPanels?.() ?? false
    clearSelection()
    clearMonsterSelection()
    return hadSelection || closedSheets
  }

  function apply(event: PointerEvent) {
    if (!isSceneCanvasEvent(event)) {
      endPointer(event)
      return
    }
    if (event.button !== 0 && event.pointerType !== 'touch') {
      endPointer(event)
      return
    }
    const start = pointerStart
    const wasMultiTouch = endPointer(event)
    if (wasMultiTouch) return
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > clickDragThreshold()) return

    const cell = hit(event)
    if (!cell) {
      dismissActiveInfoPanels()
      return
    }
    if ('monsterId' in cell) {
      selectMonster(cell.monsterId)
      return
    }
    const key = cellKey(cell)
    if (removing.value) {
      if (!('tower' in cell)) {
        dismissActiveInfoPanels()
        return
      }
      const tower = parseTower(towers.get(key))
      if (tower?.temporary) { showMessage('建造阶段的候选塔不能拆除'); return }
      towers.delete(key)
      return
    }
    if (swapping.value) {
      if (!('tower' in cell)) {
        if (swapSourceKey) {
          swapSourceKey = undefined
          showMessage('已取消交换')
        }
        dismissActiveInfoPanels()
        return
      }
      const tower = parseTower(towers.get(key))
      if (tower?.temporary) { showMessage('候选塔不能交换'); return }
      if (!swapSourceKey) {
        swapSourceKey = key
        selectTower(key)
        showMessage('已选择第一个位置，点击第二个塔或岩石完成交换')
        return
      }
      if (swapSourceKey === key) {
        swapSourceKey = undefined
        clearSelection()
        showMessage('已取消选择')
        return
      }
      swapTowerCells(swapSourceKey, key)
      swapSourceKey = undefined
      return
    }
    if (battleState.value.phase === 'combat') {
      if ('tower' in cell) {
        clearMonsterSelection()
        selectTower(key)
      } else {
        dismissActiveInfoPanels()
      }
      return
    }
    if (buildState.value.phase === 'placing') {
      if (!isPlaceableBuildCell(cell, towers)) {
        if ('tower' in cell) selectTower(key)
        else dismissActiveInfoPanels()
        return
      }
      const existing = parseTower(towers.get(key))
      if (existing?.type !== 'rock' && !calculateRoute(towers, cell)) {
        showMessage('无法放置：这会使至少一个路径点不可达')
        return
      }
      if (existing?.type === 'rock' && !calculateRoute(towers)) {
        showMessage('无法放置：当前迷宫已阻断路线')
        return
      }
      placeRandomTower(key)
      return
    }
    if ('tower' in cell) { selectTower(key); return }
    if (dismissActiveInfoPanels()) return
    if (buildState.value.phase === 'choosing') {
      showMessage('请先选择本轮保留的塔')
      return
    }
    if (cheatMode.value) {
      if (towers.has(key) || routePointAt(cell) || isReservedBuildCell(cell)) return
      if (!calculateRoute(towers, cell)) {
        showMessage('无法放置：这会使至少一个路径点不可达')
        return
      }
      placeRock(key)
      return
    }
    showMessage('请先开始本轮建造')
  }

  function cancelPointer(event: PointerEvent) {
    if (!isSceneCanvasEvent(event)) {
      endPointer(event)
      return
    }
    endPointer(event)
  }

  function hideGhost() {
    ghost.visible = false
  }

  function applyCameraView() {
    controls.target.set(0, 0, 0)
    if (topDownView.value) {
      controls.enableRotate = false
      camera.up.set(0, 0, -1)
      camera.position.set(0, 54, .001)
    } else {
      controls.enableRotate = true
      camera.up.set(0, 1, 0)
      camera.position.set(31, 34, 31)
    }
    camera.lookAt(controls.target)
    controls.update()
  }

  function toggleCameraView() {
    topDownView.value = !topDownView.value
    applyCameraView()
  }

  function resetView() {
    if (topDownView.value) applyCameraView()
    else controls.reset()
  }

  function initScene() {
    if (!host.value || initialized) return
    scene = new THREE.Scene()
    scene.background = new THREE.Color('#e7eee7')
    scene.fog = new THREE.Fog('#e7eee7', 42, 90)
    camera = new THREE.OrthographicCamera(-28, 28, 28, -28, .1, 140)
    camera.position.set(31, 34, 31)
    camera.lookAt(0, 0, 0)
    const coarse = isCoarsePointer()
    renderer = new THREE.WebGLRenderer({ antialias: !coarse })
    renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.25 : 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.shadowMap.enabled = !coarse
    host.value.appendChild(renderer.domElement)
    controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 0, 0)
    controls.enableDamping = true
    controls.dampingFactor = .08
    controls.minZoom = .65
    controls.maxZoom = 6
    controls.minPolarAngle = 0
    controls.maxPolarAngle = Math.PI / 2
    if (coarse) topDownView.value = true
    applyCameraView()
    controls.saveState()
    scene.add(new THREE.HemisphereLight('#f9fff1', '#405447', 2.7))
    const sun = new THREE.DirectionalLight('#fff5dc', coarse ? 2.4 : 3.1)
    sun.position.set(-10, 20, 12)
    if (!coarse) sun.castShadow = true
    scene.add(sun)
    ;[...towerTypes, rockType].forEach((tower) => {
      towerMaterials.set(
        tower.id,
        new THREE.MeshStandardMaterial({
          color: tower.color,
          roughness: tower.id === 'rock' ? 1 : .75,
          metalness: tower.id === 'diamond' ? .16 : 0,
        }),
      )
    })
    warmRecipePrototypes()
    createMap()
    syncLayoutGuide()
    scene.add(cellGroup, rangeIndicatorGroup, layoutGuideGroup, towerGroup, monsterGroup, projectileGroup, effectGroup, ghost)
    rebuildTowers()
    resize()
    animationClock.start()
    initialized = true
  }

  function disposeScene() {
    if (!initialized) return
    initialized = false
    controls?.dispose()
    renderer?.dispose()
    cellGeometry.dispose()
    cellMaterial.dispose()
    towerGeometry.dispose()
    recipeHaloGeometry.dispose()
    monsterBodyGeometry.dispose()
    monsterBossGeometry.dispose()
    monsterEyeGeometry.dispose()
    monsterWingGeometry.dispose()
    healthBarGeometry.dispose()
    projectileGeometry.dispose()
    impactGeometry.dispose()
    healthBackMaterial.dispose()
    healthFillMaterial.dispose()
    eyeMaterial.dispose()
    projectileMaterials.forEach((material) => material.dispose())
    candidateGlowGeometry.dispose()
    candidateGlowMaterial.dispose()
    selectionRingGeometry.dispose()
    selectionRingMaterial.dispose()
    monsterSelectionRingGeometry.dispose()
    monsterSelectionRingMaterial.dispose()
    rangeFillMaterial.dispose()
    rangeEdgeMaterial.dispose()
    auraRangeFillMaterial.dispose()
    auraRangeEdgeMaterial.dispose()
    layoutGuideGeometry.dispose()
    layoutGuideMaterial.dispose()
    clearAuraPulseMaterials()
    clearLayoutGuide()
    clearRangeIndicator()
    ghostMaterial.dispose()
    clearPathLines()
    pathMaterials.forEach((material) => material.dispose())
    ;(ghostOutline.material as THREE.Material).dispose()
    towerMaterials.forEach((item) => item.dispose())
    specialMaterials.forEach((item) => item.dispose())
    towerMixers.length = 0
    towerVisualByKey.clear()
    seenProjectileIds.clear()
    recipePrototypes.clear()
    monsterVisuals.forEach((visual) => {
      ;(((visual.userData.healthBar as THREE.Group).children[0] as THREE.Mesh).material as THREE.Material)?.dispose()
      ;((visual.userData.healthFill as THREE.Mesh).material as THREE.Material)?.dispose()
      ;(visual.userData.bodyMaterial as THREE.Material)?.dispose()
    })
    monsterVisuals.clear()
    projectileVisuals.clear()
    impactEffects.splice(0, impactEffects.length)
  }

  watch(selectedTowerKey, () => rebuildTowers())
  watch(selectedMonsterId, (id) => {
    monsterVisuals.forEach((visual, monsterId) => {
      const ring = visual.userData.selectionRing as THREE.Mesh | undefined
      if (ring) ring.visible = id === monsterId
    })
  })
  watch(hoveredAuraAbilityId, () => rebuildTowers())
  watch(layoutGuideCells, () => syncLayoutGuide(), { deep: true })
  watch(removing, (active) => {
    ghost.visible = false
    if (active) swapping.value = false
  })
  watch(swapping, (active) => {
    ghost.visible = false
    swapSourceKey = undefined
    if (active) removing.value = false
  })
  watch(cheatMode, () => { ghost.visible = false })
  towers.observe(handleTowersChanged)

  useResizeObserver(host, () => resize())

  const { pause, resume } = useRafFn(renderFrame, { immediate: false })

  onMounted(() => {
    initScene()
    resume()
  })

  tryOnScopeDispose(() => {
    pause()
    towers.unobserve(handleTowersChanged)
    disposeScene()
  })

  return {
    host,
    detailPanel,
    monsterDetailPanel,
    towerDetailStyle,
    monsterDetailStyle,
    routeLength,
    materialFor,
    towerDisplayName,
    beginPointer,
    updateGhost,
    apply,
    cancelPointer,
    hideGhost,
    toggleCameraView,
    resetView,
    applyCameraView,
    syncBattleVisuals,
    rebuildTowers,
  }
}
