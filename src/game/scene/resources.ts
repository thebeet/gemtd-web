import * as THREE from 'three'

/** Geometry and materials shared by one scene, with a single disposal boundary. */
export function createSceneResources() {
  const monsterSelectionRingGeometry = new THREE.RingGeometry(0.42, 0.58, 32)
  const monsterSelectionRingMaterial = new THREE.MeshBasicMaterial({
    color: '#d4a017',
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  const cellGeometry = new THREE.BoxGeometry(0.94, 0.1, 0.94)
  const cellMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 })
  const towerGeometry = new THREE.CylinderGeometry(0.68, 0.8, 1.65, 6)
  const recipeHaloGeometry = new THREE.TorusGeometry(0.58, 0.038, 6, 32)
  const monsterBodyGeometry = new THREE.IcosahedronGeometry(.38, 1)
  const monsterBossGeometry = new THREE.DodecahedronGeometry(.62, 1)
  const monsterEyeGeometry = new THREE.SphereGeometry(.055, 8, 6)
  const monsterWingGeometry = new THREE.ConeGeometry(.26, .62, 3)
  const healthBarGeometry = new THREE.PlaneGeometry(1.18, .14)
  const healthBackGeometry = new THREE.PlaneGeometry(1.24, .20)
  const HEALTH_BAR_HALF_WIDTH = 1.18 / 2
  const projectileGeometry = new THREE.SphereGeometry(.09, 10, 8)
  const laserCoreGeometry = new THREE.CylinderGeometry(.035, .035, 1, 8)
  const laserGlowGeometry = new THREE.CylinderGeometry(.11, .11, 1, 10)
  const laserCoreMaterial = new THREE.MeshBasicMaterial({
    color: '#eef8ff',
    transparent: true,
    opacity: .98,
    depthWrite: false,
  })
  const laserGlowMaterial = new THREE.MeshBasicMaterial({
    color: '#7ec8ff',
    transparent: true,
    opacity: .42,
    depthWrite: false,
  })
  const laserUp = new THREE.Vector3(0, 1, 0)
  const laserDir = new THREE.Vector3()
  const laserFrom = new THREE.Vector3()
  const laserTo = new THREE.Vector3()
  const lightningCoreGeometry = new THREE.CylinderGeometry(.018, .018, 1, 6)
  const lightningGlowGeometry = new THREE.CylinderGeometry(.045, .045, 1, 8)
  const lightningSegFrom = new THREE.Vector3()
  const lightningSegTo = new THREE.Vector3()
  const lightningSegDir = new THREE.Vector3()
  const arrowShaftGeometry = new THREE.CylinderGeometry(.028, .028, .32, 6)
  const arrowTipGeometry = new THREE.ConeGeometry(.09, .22, 7)
  const arrowFletchGeometry = new THREE.ConeGeometry(.07, .12, 3)
  const arrowBodyMaterial = new THREE.MeshBasicMaterial({
    color: '#5dff8a',
    transparent: true,
    opacity: .98,
    depthWrite: false,
  })
  const arrowGlowMaterial = new THREE.MeshBasicMaterial({
    color: '#b8ffd0',
    transparent: true,
    opacity: .55,
    depthWrite: false,
  })
  const arrowTrailMaterial = new THREE.LineBasicMaterial({
    color: '#62e398',
    transparent: true,
    opacity: .9,
    depthWrite: false,
    depthTest: true,
    vertexColors: true,
  })
  const arrowUp = new THREE.Vector3(0, 1, 0)
  const arrowDir = new THREE.Vector3()
  const arrowTrailTipColor = new THREE.Color('#b8ffd0')
  const arrowTrailTailColor = new THREE.Color('#1f6b3f')
  const ARROW_TRAIL_MAX_POINTS = 56
  const ARROW_TRAIL_MIN_STEP = 0.06
  const impactGeometry = new THREE.RingGeometry(.12, .18, 20)
  // Both layers are opaque so the background cannot be sorted over the fill.
  const healthBackMaterial = new THREE.MeshBasicMaterial({ color: '#000000', depthTest: false, depthWrite: false, fog: false, toneMapped: false })
  const healthFillMaterial = new THREE.MeshBasicMaterial({ color: '#e53935', depthTest: false, depthWrite: false, fog: false, toneMapped: false })
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

  const resources = {
    monsterSelectionRingGeometry,
    monsterSelectionRingMaterial,
    cellGeometry,
    cellMaterial,
    towerGeometry,
    recipeHaloGeometry,
    monsterBodyGeometry,
    monsterBossGeometry,
    monsterEyeGeometry,
    monsterWingGeometry,
    healthBarGeometry,
    healthBackGeometry,
    HEALTH_BAR_HALF_WIDTH,
    projectileGeometry,
    laserCoreGeometry,
    laserGlowGeometry,
    laserCoreMaterial,
    laserGlowMaterial,
    laserUp,
    laserDir,
    laserFrom,
    laserTo,
    lightningCoreGeometry,
    lightningGlowGeometry,
    lightningSegFrom,
    lightningSegTo,
    lightningSegDir,
    arrowShaftGeometry,
    arrowTipGeometry,
    arrowFletchGeometry,
    arrowBodyMaterial,
    arrowGlowMaterial,
    arrowTrailMaterial,
    arrowUp,
    arrowDir,
    arrowTrailTipColor,
    arrowTrailTailColor,
    ARROW_TRAIL_MAX_POINTS,
    ARROW_TRAIL_MIN_STEP,
    impactGeometry,
    healthBackMaterial,
    healthFillMaterial,
    eyeMaterial,
    projectileMaterials,
    candidateGlowGeometry,
    candidateGlowMaterial,
    selectionRingGeometry,
    selectionRingMaterial,
    rangeFillMaterial,
    rangeEdgeMaterial,
    auraRangeFillMaterial,
    auraRangeEdgeMaterial,
    layoutGuideGeometry,
    layoutGuideMaterial,
  }
  function dispose() {
    for (const resource of Object.values(resources)) {
      if (resource instanceof THREE.BufferGeometry || resource instanceof THREE.Material) resource.dispose()
    }
  }
  return { ...resources, dispose }
}
